import { APIError, type Endpoint } from 'payload'

import {
  createAgentSession,
  listAgentMessages,
  sendAgentMessage,
  updateRunFromCallback,
} from '@/n8n/agents/invokeAgent'
import { AgentHarnessError, type AgentRequest } from '@/n8n/agents/types'

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

export const agentEndpoints: Endpoint[] = [
  {
    path: '/agents/:slug/sessions',
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
    path: '/agent-sessions/:id/messages',
    method: 'post',
    handler: async (req) => {
      try {
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
    path: '/agent-sessions/:id/messages',
    method: 'get',
    handler: async (req) => {
      try {
        const messages = await listAgentMessages({
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
    path: '/agent-runs/:requestID/events',
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
    path: '/agent-runs/:id/feedback',
    method: 'post',
    handler: async (req) => {
      const userReq = requireUser(req)
      const body = req.json ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}
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
]
