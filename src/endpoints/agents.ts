import { APIError, type Endpoint } from 'payload'

import {
  cancelAgentRun,
  createAgentSession,
  deleteAgentSession,
  listAgentApprovals,
  listAgentMessages,
  listAgentSessions,
  resolveAgentApproval,
  sendAgentMessage,
  streamAgentMessage,
  updateRunFromCallback,
} from '@/n8n/agents/invokeAgent'
import { AgentHarnessError, type AgentRequest } from '@/n8n/agents/types'
import {
  agentSetupGuideByIDEndpoint,
  agentSetupGuideEndpoint,
  testAgentSetupEndpoint,
} from '@/endpoints/testAgentSetup'

const requireUser = (req: Parameters<Endpoint['handler']>[0]): AgentRequest => {
  if (!req.user) throw new APIError('Unauthorized', 401)
  return req as AgentRequest
}

const handleAgentError = (error: unknown): Response => {
  if (error instanceof AgentHarnessError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  throw error
}

const readBody = async (req: Parameters<Endpoint['handler']>[0]) =>
  req.json ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}

const wantsEventStream = (req: Parameters<Endpoint['handler']>[0]) =>
  req.headers.get('accept')?.includes('text/event-stream') ||
  req.headers.get('x-agent-stream') === 'true'

const getQueryNumber = (req: Parameters<Endpoint['handler']>[0], key: string, fallback: number) => {
  const value = new URL(req.url ?? 'http://localhost').searchParams.get(key)
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

const requireCallbackSecret = (req: Parameters<Endpoint['handler']>[0]) => {
  const authHeader = req.headers.get('authorization')
  if (
    !process.env.N8N_CALLBACK_SECRET ||
    authHeader !== `Bearer ${process.env.N8N_CALLBACK_SECRET}`
  ) {
    throw new AgentHarnessError('auth', 'Unauthorized.', 401)
  }
}

const getRelationValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const evaluationRunStatuses = ['queued', 'running', 'succeeded', 'failed'] as const

type EvaluationRunStatus = (typeof evaluationRunStatuses)[number]

const getEvaluationRunStatus = (value: unknown): EvaluationRunStatus =>
  evaluationRunStatuses.includes(value as EvaluationRunStatus)
    ? (value as EvaluationRunStatus)
    : 'succeeded'

const getAgentIDForEvaluation = async (
  req: Parameters<Endpoint['handler']>[0],
  body: Record<string, unknown>,
) => {
  const agentID = getRelationValue(body.agentID)
  if (agentID) return agentID

  const agentSlug = getRelationValue(body.agentSlug)
  if (!agentSlug) return undefined

  const result = await req.payload.find({
    collection: 'agents',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: agentSlug } },
  })

  return result.docs[0]?.id ? String(result.docs[0].id) : undefined
}

const upsertAgentEvaluationRun = async (req: Parameters<Endpoint['handler']>[0]) => {
  requireCallbackSecret(req)
  const body = await readBody(req)
  const runID = getRelationValue(body.id)
  const n8nExecutionID = getRelationValue(body.n8nExecutionID)
  const status = getEvaluationRunStatus(body.status)
  const data = {
    dataTable: getRelationValue(body.dataTableID),
    finishedAt: getRelationValue(body.finishedAt),
    metrics:
      body.metrics && typeof body.metrics === 'object'
        ? (body.metrics as Record<string, unknown>)
        : undefined,
    n8nExecutionID,
    score: typeof body.score === 'number' ? body.score : undefined,
    startedAt: getRelationValue(body.startedAt),
    status,
    summary: typeof body.summary === 'string' ? body.summary.slice(0, 5000) : undefined,
    workflow: getRelationValue(body.workflowID),
  }

  if (runID) {
    return req.payload.update({
      collection: 'agent-evaluation-runs',
      data,
      id: runID,
      overrideAccess: true,
    })
  }

  if (n8nExecutionID) {
    const existing = await req.payload.find({
      collection: 'agent-evaluation-runs',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { n8nExecutionID: { equals: n8nExecutionID } },
    })

    if (existing.docs[0]) {
      return req.payload.update({
        collection: 'agent-evaluation-runs',
        data,
        id: existing.docs[0].id,
        overrideAccess: true,
      })
    }
  }

  const agentID = await getAgentIDForEvaluation(req, body)
  if (!agentID) {
    throw new AgentHarnessError('input-validation', 'agentID or agentSlug is required.', 400)
  }

  return req.payload.create({
    collection: 'agent-evaluation-runs',
    data: {
      ...data,
      agent: agentID,
      name:
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim().slice(0, 200)
          : `Evaluation ${new Date().toISOString()}`,
    },
    overrideAccess: true,
  })
}

export const agentSessionCollectionEndpoints: Endpoint[] = [
  {
    path: '/:id/messages',
    method: 'post',
    handler: async (req) => {
      try {
        if (wantsEventStream(req)) {
          return streamAgentMessage({
            req: requireUser(req),
            sessionID: String(req.routeParams?.id ?? ''),
          })
        }

        const result = await sendAgentMessage({
          req: requireUser(req),
          sessionID: String(req.routeParams?.id ?? ''),
        })

        return Response.json(result)
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
  {
    path: '/:id/messages',
    method: 'get',
    handler: async (req) => {
      try {
        const messages = await listAgentMessages({
          page: getQueryNumber(req, 'page', 1),
          req: requireUser(req),
          sessionID: String(req.routeParams?.id ?? ''),
        })

        return Response.json(messages)
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
  {
    path: '/:id/approvals',
    method: 'get',
    handler: async (req) => {
      try {
        const approvals = await listAgentApprovals({
          req: requireUser(req),
          sessionID: String(req.routeParams?.id ?? ''),
        })

        return Response.json(approvals)
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
  {
    path: '/:id/delete',
    method: 'post',
    handler: async (req) => {
      try {
        const result = await deleteAgentSession({
          req: requireUser(req),
          sessionID: String(req.routeParams?.id ?? ''),
        })

        return Response.json(result)
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
]

export const agentRunCollectionEndpoints: Endpoint[] = [
  {
    path: '/:requestID/events',
    method: 'post',
    handler: async (req) => {
      try {
        const run = await updateRunFromCallback(req)
        return Response.json({ run })
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
  {
    path: '/:id/feedback',
    method: 'post',
    handler: async (req) => {
      const userReq = requireUser(req)
      const body = await readBody(req)
      const rating = Number(body.rating)

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return Response.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 })
      }

      const run = await userReq.payload.update({
        collection: 'agent-runs',
        data: {
          feedback: {
            comment: typeof body.comment === 'string' ? body.comment.slice(0, 2000) : undefined,
            rating,
            submittedAt: new Date().toISOString(),
          },
        },
        id: String(req.routeParams?.id ?? ''),
        overrideAccess: false,
        req: userReq,
        user: userReq.user,
      })

      return Response.json({ run })
    },
  },
  {
    path: '/:id/cancel',
    method: 'post',
    handler: async (req) => {
      try {
        const run = await cancelAgentRun({
          req: requireUser(req),
          runID: String(req.routeParams?.id ?? ''),
        })

        return Response.json({ run })
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
]

export const agentApprovalCollectionEndpoints: Endpoint[] = [
  {
    path: '/:id/resolve',
    method: 'post',
    handler: async (req) => {
      try {
        const userReq = requireUser(req)
        const body = await readBody(req)
        const approval = await resolveAgentApproval({
          approvalID: String(req.routeParams?.id ?? ''),
          approved: body.approved !== false,
          req: userReq,
          responsePayload:
            body.data && typeof body.data === 'object'
              ? (body.data as Record<string, unknown>)
              : undefined,
        })

        return Response.json({ approval })
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
]

export const agentEvaluationRunCollectionEndpoints: Endpoint[] = [
  {
    path: '/events',
    method: 'post',
    handler: async (req) => {
      try {
        const evaluationRun = await upsertAgentEvaluationRun(req)
        return Response.json({ evaluationRun })
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
]

export const agentEndpoints: Endpoint[] = []

export const agentCollectionEndpoints: Endpoint[] = [
  { ...agentSetupGuideEndpoint, path: '/setup-guide' },
  { ...agentSetupGuideByIDEndpoint, path: '/:id/setup-guide' },
  { ...testAgentSetupEndpoint, path: '/test-setup' },
  {
    path: '/:slug/sessions',
    method: 'post',
    handler: async (req) => {
      try {
        const session = await createAgentSession({
          req: requireUser(req),
          slug: String(req.routeParams?.slug ?? ''),
        })

        return Response.json({ session })
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
  {
    path: '/:slug/sessions',
    method: 'get',
    handler: async (req) => {
      try {
        const sessions = await listAgentSessions({
          req: requireUser(req),
          slug: String(req.routeParams?.slug ?? ''),
        })

        return Response.json(sessions)
      } catch (error) {
        return handleAgentError(error)
      }
    },
  },
]
