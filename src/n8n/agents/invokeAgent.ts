import { randomUUID } from 'crypto'

import { getRelationshipID, resolveAgentBySlug } from './resolveAgent'
import { invokeN8nAgent } from './adapters'
import { redactValue, toPreview } from './redact'
import { AgentHarnessError, type AgentRequest } from './types'

const MAX_CONTEXT_KEYS = 20

type JSONReadableRequest = {
  json?: () => Promise<unknown>
}

const asPayloadJSON = (value: unknown) =>
  value as string | number | boolean | unknown[] | { [k: string]: unknown } | null | undefined

const readJSON = async (req: JSONReadableRequest): Promise<Record<string, unknown>> => {
  if (!req.json) return {}

  try {
    const value = await req.json()
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const assertTextInput = (value: unknown, maxBytes: number): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AgentHarnessError('input-validation', 'Message text is required.', 400)
  }

  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new AgentHarnessError('input-validation', 'Message text is too large.', 413)
  }

  return value
}

const sanitizeContext = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, MAX_CONTEXT_KEYS))
}

const getNextSequence = async (req: AgentRequest, sessionID: string): Promise<number> => {
  const latest = await req.payload.find({
    collection: 'agent-messages',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    sort: '-sequence',
    user: req.user,
    where: {
      session: {
        equals: sessionID,
      },
    },
  })

  const latestSequence = latest.docs[0]?.sequence
  return typeof latestSequence === 'number' ? latestSequence + 1 : 1
}

export const createAgentSession = async ({
  req,
  slug,
}: {
  req: AgentRequest
  slug: string
}) => {
  const body = await readJSON(req)
  const { agent } = await resolveAgentBySlug({ req, slug })
  const now = new Date().toISOString()

  const session = await req.payload.create({
    collection: 'agent-sessions',
    data: {
      agent: String(agent.id),
      externalSessionID: randomUUID(),
      lastMessageAt: now,
      metadata: asPayloadJSON(redactValue(sanitizeContext(body.context))),
      status: 'active',
      title:
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim()
          : typeof agent.name === 'string'
            ? agent.name
            : 'New session',
      user: req.user.id,
    },
    overrideAccess: false,
    req,
    user: req.user,
  })

  return session
}

export const sendAgentMessage = async ({
  req,
  sessionID,
}: {
  req: AgentRequest
  sessionID: string
}) => {
  const body = await readJSON(req)
  const session = await req.payload.findByID({
    collection: 'agent-sessions',
    depth: 2,
    id: sessionID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  if (!session) throw new AgentHarnessError('not-found', 'Session not found.', 404)
  if (session.status === 'waiting') {
    throw new AgentHarnessError('input-validation', 'Session is waiting for the current run to finish.', 409)
  }

  const agent = session.agent
  if (!agent || typeof agent !== 'object' || typeof agent.slug !== 'string') {
    throw new AgentHarnessError('input-validation', 'Session agent is not configured.', 500)
  }

  const resolved = await resolveAgentBySlug({ req, slug: agent.slug })
  const maxInputBytes =
    typeof resolved.agent.maxInputBytes === 'number' ? resolved.agent.maxInputBytes : 20000
  const text = assertTextInput(body.text, maxInputBytes)
  const requestID = randomUUID()
  const startedAt = new Date()
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? `${sessionID}:${body.idempotencyKey.trim()}`
      : undefined

  if (idempotencyKey) {
    const existing = await req.payload.find({
      collection: 'agent-runs',
      depth: 1,
      limit: 1,
      overrideAccess: false,
      req,
      user: req.user,
      where: { idempotencyKey: { equals: idempotencyKey } },
    })

    if (existing.docs[0]) return { reused: true, run: existing.docs[0] }
  }

  const sequence = await getNextSequence(req, sessionID)

  const run = await req.payload.create({
    collection: 'agent-runs',
    data: {
      agent: String(resolved.agent.id),
      idempotencyKey,
      inputPreview: toPreview(text),
      requestID,
      session: sessionID,
      startedAt: startedAt.toISOString(),
      status: 'running',
      user: req.user.id,
    },
    overrideAccess: false,
    req,
    user: req.user,
  })

  const userMessage = await req.payload.create({
    collection: 'agent-messages',
    data: {
      content: text,
      createdBy: req.user.id,
      role: 'user',
      run: run.id,
      sequence,
      session: sessionID,
      status: 'complete',
    },
    overrideAccess: false,
    req,
    user: req.user,
  })

  try {
    const response = await invokeN8nAgent({
      agent: resolved.agent,
      invocation: {
        actor: {
          id: req.user.id,
          roles: Array.isArray(req.user.roleNames)
            ? req.user.roleNames.filter((role): role is string => typeof role === 'string')
            : [],
        },
        context: sanitizeContext(body.context),
        input: {
          data: body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : undefined,
          text,
        },
        requestID,
        sessionID: session.externalSessionID,
      },
      server: resolved.server,
    })

    const finishedAt = new Date()
    const status = response.status === 'waiting' ? 'waiting' : 'succeeded'

    const assistantMessage = await req.payload.create({
      collection: 'agent-messages',
      data: {
        content: response.content,
        role: 'assistant',
        run: run.id,
        sequence: sequence + 1,
        session: sessionID,
        status: status === 'waiting' ? 'pending' : 'complete',
        structuredContent: asPayloadJSON(response.data ? redactValue(response.data) : undefined),
      },
      overrideAccess: false,
      req,
      user: req.user,
    })

    const updatedRun = await req.payload.update({
      collection: 'agent-runs',
      data: {
        durationMS: finishedAt.getTime() - startedAt.getTime(),
        finishedAt: status === 'succeeded' ? finishedAt.toISOString() : undefined,
        n8nExecutionID: response.n8nExecutionID,
        outputPreview: toPreview(response.content),
        status,
        usage: asPayloadJSON(response.usage ? redactValue(response.usage) : undefined),
      },
      id: run.id,
      overrideAccess: false,
      req,
      user: req.user,
    })

    await req.payload.update({
      collection: 'agent-sessions',
      data: {
        lastMessageAt: finishedAt.toISOString(),
        lastRunAt: finishedAt.toISOString(),
        status: status === 'waiting' ? 'waiting' : 'active',
      },
      id: sessionID,
      overrideAccess: false,
      req,
      user: req.user,
    })

    return { assistantMessage, run: updatedRun, userMessage }
  } catch (error) {
    const finishedAt = new Date()
    const harnessError =
      error instanceof AgentHarnessError
        ? error
        : new AgentHarnessError('workflow-error', 'The agent request failed.', 502)

    const failedRun = await req.payload.update({
      collection: 'agent-runs',
      data: {
        durationMS: finishedAt.getTime() - startedAt.getTime(),
        errorCode: harnessError.code,
        errorMessage: harnessError.message,
        finishedAt: finishedAt.toISOString(),
        status: harnessError.code === 'upstream-timeout' ? 'timed-out' : 'failed',
      },
      id: run.id,
      overrideAccess: false,
      req,
      user: req.user,
    })

    await req.payload.update({
      collection: 'agent-sessions',
      data: {
        lastRunAt: finishedAt.toISOString(),
        status: 'failed',
      },
      id: sessionID,
      overrideAccess: false,
      req,
      user: req.user,
    })

    return { error: harnessError.message, run: failedRun, userMessage }
  }
}

export const listAgentMessages = async ({
  req,
  sessionID,
}: {
  req: AgentRequest
  sessionID: string
}) => {
  await req.payload.findByID({
    collection: 'agent-sessions',
    depth: 0,
    id: sessionID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  return req.payload.find({
    collection: 'agent-messages',
    depth: 1,
    limit: 50,
    overrideAccess: false,
    req,
    sort: 'sequence',
    user: req.user,
    where: {
      session: {
        equals: sessionID,
      },
    },
  })
}

export const updateRunFromCallback = async (
  req: JSONReadableRequest & {
    headers: { get: (name: string) => string | null }
    payload: AgentRequest['payload']
  },
) => {
  const authHeader = req.headers.get('authorization')
  if (!process.env.N8N_CALLBACK_SECRET || authHeader !== `Bearer ${process.env.N8N_CALLBACK_SECRET}`) {
    throw new AgentHarnessError('auth', 'Unauthorized.', 401)
  }

  const body = await readJSON(req)
  const requestID = typeof body.requestID === 'string' ? body.requestID : ''
  if (!requestID) throw new AgentHarnessError('input-validation', 'requestID is required.', 400)

  const runResult = await req.payload.find({
    collection: 'agent-runs',
    depth: 1,
    limit: 1,
    overrideAccess: true,
    where: { requestID: { equals: requestID } },
  })

  const run = runResult.docs[0]
  if (!run) throw new AgentHarnessError('not-found', 'Run not found.', 404)

  const status = body.status === 'failed' ? 'failed' : 'succeeded'
  const finishedAt = new Date()
  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : finishedAt.getTime()
  const content = typeof body.content === 'string' ? body.content : toPreview(body.output ?? body)
  const sessionID = getRelationshipID(run.session)

  const updatedRun = await req.payload.update({
    collection: 'agent-runs',
    data: {
      durationMS: finishedAt.getTime() - startedAt,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : undefined,
      errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
      finishedAt: finishedAt.toISOString(),
      n8nExecutionID: typeof body.n8nExecutionID === 'string' ? body.n8nExecutionID : undefined,
      outputPreview: toPreview(content),
      status,
      usage: asPayloadJSON(
        body.usage && typeof body.usage === 'object' ? redactValue(body.usage) : undefined,
      ),
    },
    id: run.id,
    overrideAccess: true,
  })

  if (sessionID && status === 'succeeded') {
    const latest = await req.payload.find({
      collection: 'agent-messages',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      sort: '-sequence',
      where: { session: { equals: sessionID } },
    })
    const sequence = typeof latest.docs[0]?.sequence === 'number' ? latest.docs[0].sequence + 1 : 1

    await req.payload.create({
      collection: 'agent-messages',
      data: {
        content,
        role: 'assistant',
        run: run.id,
        sequence,
        session: sessionID,
        status: 'complete',
        structuredContent: asPayloadJSON(
          body.data && typeof body.data === 'object' ? redactValue(body.data) : undefined,
        ),
      },
      overrideAccess: true,
    })

    await req.payload.update({
      collection: 'agent-sessions',
      data: {
        lastMessageAt: finishedAt.toISOString(),
        lastRunAt: finishedAt.toISOString(),
        status: 'active',
      },
      id: sessionID,
      overrideAccess: true,
    })
  }

  return updatedRun
}
