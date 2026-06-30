import { randomUUID } from 'crypto'
import * as Sentry from '@sentry/nextjs'

import { assertSameServerURL } from './buildEndpoint'
import { getRelationshipID, resolveAgentBySlug } from './resolveAgent'
import { invokeN8nAgent, invokeN8nAgentStream, stopN8nExecution } from './adapters'
import { redactValue, toPreview } from './redact'
import { AgentHarnessError, type AgentRequest, type AgentStreamEvent } from './types'

const MAX_CONTEXT_KEYS = 20
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000
const DEFAULT_MAX_RUNS_PER_WINDOW = 12
const DEFAULT_MAX_CONCURRENT_RUNS = 1
const TERMINAL_RUN_STATUSES = ['succeeded', 'failed', 'timed-out', 'cancelled'] as const

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

const getObjectInput = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const schemaTypeMatches = (value: unknown, type: string) => {
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  if (type === 'null') return value === null
  return typeof value === type
}

const validateJSONSchemaValue = ({
  path,
  schema,
  value,
}: {
  path: string
  schema: Record<string, unknown>
  value: unknown
}) => {
  const schemaType = schema.type
  const types = Array.isArray(schemaType)
    ? schemaType.filter((type): type is string => typeof type === 'string')
    : typeof schemaType === 'string'
      ? [schemaType]
      : []

  if (types.length > 0 && !types.some((type) => schemaTypeMatches(value, type))) {
    throw new AgentHarnessError(
      'input-validation',
      `${path} does not match the configured schema.`,
      400,
    )
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    throw new AgentHarnessError('input-validation', `${path} is not an allowed value.`, 400)
  }

  if (schema.type === 'object' || (value && typeof value === 'object' && !Array.isArray(value))) {
    const objectValue = getObjectInput(value)
    if (!objectValue) return

    const required = Array.isArray(schema.required)
      ? schema.required.filter((field): field is string => typeof field === 'string')
      : []
    for (const field of required) {
      if (!(field in objectValue)) {
        throw new AgentHarnessError('input-validation', `${path}.${field} is required.`, 400)
      }
    }

    const properties = getObjectInput(schema.properties)
    if (!properties) return

    for (const [key, childSchema] of Object.entries(properties)) {
      if (!(key in objectValue) || !getObjectInput(childSchema)) continue
      validateJSONSchemaValue({
        path: `${path}.${key}`,
        schema: childSchema as Record<string, unknown>,
        value: objectValue[key],
      })
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && getObjectInput(schema.items)) {
    value.forEach((item, index) =>
      validateJSONSchemaValue({
        path: `${path}[${index}]`,
        schema: schema.items as Record<string, unknown>,
        value: item,
      }),
    )
  }
}

const validateConfiguredSchema = ({
  label,
  schema,
  value,
}: {
  label: string
  schema: unknown
  value: unknown
}) => {
  const schemaObject = getObjectInput(schema)
  if (!schemaObject) return

  validateJSONSchemaValue({ path: label, schema: schemaObject, value })
}

const getStructuredInput = (body: Record<string, unknown>, agent: Record<string, unknown>) => {
  const data = getObjectInput(body.data)

  if (agent.inputMode === 'structured' && !data) {
    throw new AgentHarnessError('input-validation', 'Structured input data is required.', 400)
  }

  validateConfiguredSchema({ label: 'input', schema: agent.inputSchema, value: data ?? {} })
  return data
}

const sanitizeContext = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, MAX_CONTEXT_KEYS),
  )
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

const isTerminalRunStatus = (status: unknown): status is (typeof TERMINAL_RUN_STATUSES)[number] =>
  typeof status === 'string' &&
  TERMINAL_RUN_STATUSES.includes(status as (typeof TERMINAL_RUN_STATUSES)[number])

const isUniqueConstraintError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes('duplicate key') ||
    error.message.includes('E11000') ||
    error.message.includes('unique'))

const toCapacityError = (error: unknown) => {
  if (!isUniqueConstraintError(error)) throw error
  throw new AgentHarnessError(
    'rate-limited',
    'This session already has a message in progress.',
    409,
  )
}

const getRunState = async (req: AgentRequest, runID: string) =>
  req.payload.findByID({
    collection: 'agent-runs',
    depth: 0,
    id: runID,
    overrideAccess: false,
    req,
    user: req.user,
  })

const isRunStillWritable = async (req: AgentRequest, runID: string) => {
  const latestRun = await getRunState(req, runID)
  return Boolean(latestRun && !isTerminalRunStatus(latestRun.status))
}

const getSystemServerForAgent = async ({
  agent,
  req,
}: {
  agent: Record<string, unknown>
  req: Pick<AgentRequest, 'payload'>
}) => {
  const serverID = getRelationshipID(agent.server)
  if (!serverID) return null

  return req.payload.findByID({
    collection: 'servers',
    depth: 0,
    id: serverID,
    overrideAccess: true,
  })
}

const stopExecutionForAgent = async ({
  agent,
  executionID,
  req,
}: {
  agent: Record<string, unknown>
  executionID?: string | null
  req: Pick<AgentRequest, 'payload'>
}) => {
  if (!executionID) return

  const server = await getSystemServerForAgent({ agent, req })
  if (!server) return

  await stopN8nExecution({
    executionID,
    server: server as unknown as Record<string, unknown>,
  })
}

const assertRunCapacity = async ({
  agent,
  agentID,
  req,
  sessionID,
}: {
  agent: Record<string, unknown>
  agentID: string
  req: AgentRequest
  sessionID: string
}) => {
  const runningStatuses = ['queued', 'running'] as const
  const sessionRuns = await req.payload.find({
    collection: 'agent-runs',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    user: req.user,
    where: {
      and: [{ session: { equals: sessionID } }, { status: { in: runningStatuses } }],
    },
  })

  if (sessionRuns.totalDocs > 0) {
    throw new AgentHarnessError(
      'rate-limited',
      'This session already has a message in progress.',
      409,
    )
  }

  const maxConcurrentRuns =
    typeof agent.maxConcurrentRuns === 'number'
      ? agent.maxConcurrentRuns
      : DEFAULT_MAX_CONCURRENT_RUNS
  const concurrentRuns = await req.payload.find({
    collection: 'agent-runs',
    depth: 0,
    limit: maxConcurrentRuns,
    overrideAccess: false,
    req,
    user: req.user,
    where: {
      and: [
        { agent: { equals: agentID } },
        { user: { equals: req.user.id } },
        { status: { in: runningStatuses } },
      ],
    },
  })

  if (concurrentRuns.totalDocs >= maxConcurrentRuns) {
    throw new AgentHarnessError(
      'rate-limited',
      'This agent already has a run in progress for your account.',
      429,
    )
  }

  const windowStart = new Date(Date.now() - DEFAULT_RATE_LIMIT_WINDOW_MS).toISOString()
  const maxRunsPerWindow =
    typeof agent.maxRunsPerMinute === 'number'
      ? agent.maxRunsPerMinute
      : DEFAULT_MAX_RUNS_PER_WINDOW
  const recentRuns = await req.payload.find({
    collection: 'agent-runs',
    depth: 0,
    limit: maxRunsPerWindow,
    overrideAccess: false,
    req,
    user: req.user,
    where: {
      and: [
        { agent: { equals: agentID } },
        { user: { equals: req.user.id } },
        { startedAt: { greater_than: windowStart } },
      ],
    },
  })

  if (recentRuns.totalDocs >= maxRunsPerWindow) {
    throw new AgentHarnessError('rate-limited', 'Too many agent requests. Try again shortly.', 429)
  }

  const maxRunsPerDay = typeof agent.maxRunsPerDay === 'number' ? agent.maxRunsPerDay : 100
  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const dailyRuns = await req.payload.find({
    collection: 'agent-runs',
    depth: 0,
    limit: maxRunsPerDay,
    overrideAccess: false,
    req,
    user: req.user,
    where: {
      and: [
        { agent: { equals: agentID } },
        { user: { equals: req.user.id } },
        { startedAt: { greater_than: dayStart } },
      ],
    },
  })

  if (dailyRuns.totalDocs >= maxRunsPerDay) {
    throw new AgentHarnessError('rate-limited', 'Daily agent quota exceeded.', 429)
  }
}

const encodeSSE = (event: AgentStreamEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`

const extractStreamContent = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  const data = value as Record<string, unknown>
  const content =
    data.content ?? data.token ?? data.delta ?? data.text ?? data.message ?? data.response
  return typeof content === 'string' ? content : ''
}

const extractStreamExecutionID = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined

  const data = value as Record<string, unknown>
  return typeof data.n8nExecutionID === 'string' ? data.n8nExecutionID : undefined
}

const parseStreamPayload = (value: string): unknown => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

const streamUpstreamToSSE = async ({
  controller,
  emit,
  onExecutionID,
  upstream,
}: {
  controller: ReadableStreamDefaultController<Uint8Array>
  emit: (event: AgentStreamEvent) => void
  onExecutionID?: (executionID: string) => void
  upstream: Response
}): Promise<{ content: string; firstByteAt?: number; n8nExecutionID?: string }> => {
  const reader = upstream.body?.getReader()
  if (!reader)
    throw new AgentHarnessError('malformed-response', 'n8n returned an empty stream.', 502)

  const decoder = new TextDecoder()
  const contentType = upstream.headers.get('content-type') ?? ''
  let buffer = ''
  let assembled = ''
  let n8nExecutionID: string | undefined
  let firstByteAt: number | undefined

  const emitToken = (content: string) => {
    if (!content) return
    firstByteAt ??= Date.now()
    assembled += content
    emit({ data: { content }, type: 'token' })
  }

  const processSSEFrame = (frame: string) => {
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())

    if (dataLines.length === 0) return
    const payload = parseStreamPayload(dataLines.join('\n'))
    const executionID = extractStreamExecutionID(payload)
    if (executionID && !n8nExecutionID) {
      n8nExecutionID = executionID
      onExecutionID?.(executionID)
    }
    const content = extractStreamContent(payload)
    emitToken(content)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })

    if (contentType.includes('text/event-stream') || contentType.includes('application/json')) {
      buffer += chunk
      if (contentType.includes('text/event-stream')) {
        const frames = buffer.split(/\n\n|\r\n\r\n/)
        buffer = frames.pop() ?? ''
        frames.forEach(processSSEFrame)
      }
    } else {
      emitToken(chunk)
    }
  }

  if (contentType.includes('text/event-stream') && buffer.trim()) {
    processSSEFrame(buffer)
  }

  if (contentType.includes('application/json') && buffer.trim()) {
    const payload = parseStreamPayload(buffer)
    const executionID = extractStreamExecutionID(payload)
    if (executionID && !n8nExecutionID) {
      n8nExecutionID = executionID
      onExecutionID?.(executionID)
    }
    emitToken(extractStreamContent(payload))
  }

  controller.enqueue(new TextEncoder().encode(': stream closed\n\n'))
  return { content: assembled, firstByteAt, n8nExecutionID }
}

const streamExistingRun = (run: {
  id: unknown
  requestID?: string | null
  status?: string | null
}) => {
  const runID = String(run.id)
  const status = isTerminalRunStatus(run.status) ? run.status : 'failed'
  const body =
    encodeSSE({
      data: { requestID: run.requestID || '', runID, status: 'running' },
      type: 'run',
    }) +
    encodeSSE({
      data: { runID, status },
      type: 'done',
    })

  return new Response(body, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    },
  })
}

export const createAgentSession = async ({ req, slug }: { req: AgentRequest; slug: string }) => {
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

export const listAgentSessions = async ({ req, slug }: { req: AgentRequest; slug: string }) => {
  const { agent } = await resolveAgentBySlug({ req, slug })

  return req.payload.find({
    collection: 'agent-sessions',
    depth: 0,
    limit: 20,
    overrideAccess: false,
    req,
    sort: '-lastMessageAt',
    user: req.user,
    where: {
      agent: {
        equals: String(agent.id),
      },
    },
  })
}

export const deleteAgentSession = async ({
  req,
  sessionID,
}: {
  req: AgentRequest
  sessionID: string
}) => {
  const session = await req.payload.findByID({
    collection: 'agent-sessions',
    depth: 0,
    id: sessionID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  if (!session) throw new AgentHarnessError('not-found', 'Session not found.', 404)

  const runs = await req.payload.find({
    collection: 'agent-runs',
    depth: 0,
    limit: 100,
    overrideAccess: false,
    req,
    user: req.user,
    where: {
      session: {
        equals: sessionID,
      },
    },
  })

  for (const run of runs.docs) {
    if (!isTerminalRunStatus(run.status)) {
      await cancelAgentRun({ req, runID: String(run.id) })
    }
  }

  await req.payload.delete({
    collection: 'agent-approvals',
    overrideAccess: true,
    req,
    where: {
      session: {
        equals: sessionID,
      },
    },
  })

  await req.payload.delete({
    collection: 'agent-messages',
    overrideAccess: true,
    req,
    where: {
      session: {
        equals: sessionID,
      },
    },
  })

  await req.payload.delete({
    collection: 'agent-runs',
    overrideAccess: true,
    req,
    where: {
      session: {
        equals: sessionID,
      },
    },
  })

  await req.payload.delete({
    collection: 'agent-sessions',
    id: sessionID,
    overrideAccess: true,
    req,
  })

  return { deleted: true, sessionID }
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
    throw new AgentHarnessError(
      'input-validation',
      'Session is waiting for the current run to finish.',
      409,
    )
  }

  const agent = session.agent
  if (!agent || typeof agent !== 'object' || typeof agent.slug !== 'string') {
    throw new AgentHarnessError('input-validation', 'Session agent is not configured.', 500)
  }

  const resolved = await resolveAgentBySlug({ req, slug: agent.slug })
  const maxInputBytes =
    typeof resolved.agent.maxInputBytes === 'number' ? resolved.agent.maxInputBytes : 20000
  const text = assertTextInput(body.text, maxInputBytes)
  const structuredInput = getStructuredInput(body, resolved.agent)
  const requestID = randomUUID()
  const startedAt = new Date()
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? `${sessionID}:${body.idempotencyKey.trim()}`
      : undefined

  if (!idempotencyKey) {
    throw new AgentHarnessError('input-validation', 'idempotencyKey is required.', 400)
  }

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
  await assertRunCapacity({
    agent: resolved.agent,
    agentID: String(resolved.agent.id),
    req,
    sessionID,
  })

  const run = await req.payload
    .create({
      collection: 'agent-runs',
      data: {
        agent: String(resolved.agent.id),
        idempotencyKey,
        inputPreview: toPreview(text),
        requestID,
        session: sessionID,
        sessionActiveLock: sessionID,
        startedAt: startedAt.toISOString(),
        status: 'running',
        user: req.user.id,
      },
      overrideAccess: false,
      req,
      user: req.user,
    })
    .catch(toCapacityError)

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
          data: structuredInput,
          text,
        },
        requestID,
        sessionID: session.externalSessionID,
      },
      server: resolved.server,
    })

    const finishedAt = new Date()
    const status = response.status === 'waiting' ? 'waiting' : 'succeeded'
    validateConfiguredSchema({
      label: 'output',
      schema: resolved.agent.outputSchema,
      value: response.data ?? { content: response.content },
    })

    if (!(await isRunStillWritable(req, String(run.id)))) {
      return { run: await getRunState(req, String(run.id)), userMessage }
    }

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
        firstByteMS: finishedAt.getTime() - startedAt.getTime(),
        n8nExecutionID: response.n8nExecutionID,
        outputPreview: toPreview(response.content),
        sessionActiveLock: status === 'waiting' ? sessionID : `released:${run.id}`,
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

    if (!(await isRunStillWritable(req, String(run.id)))) {
      return {
        error: harnessError.message,
        run: await getRunState(req, String(run.id)),
        userMessage,
      }
    }

    const failedRun = await req.payload.update({
      collection: 'agent-runs',
      data: {
        durationMS: finishedAt.getTime() - startedAt.getTime(),
        errorCode: harnessError.code,
        errorMessage: harnessError.message,
        finishedAt: finishedAt.toISOString(),
        sessionActiveLock: `released:${run.id}`,
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

export const streamAgentMessage = async ({
  req,
  sessionID,
}: {
  req: AgentRequest
  sessionID: string
}): Promise<Response> => {
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
    throw new AgentHarnessError(
      'input-validation',
      'Session is waiting for the current run to finish.',
      409,
    )
  }

  const agent = session.agent
  if (!agent || typeof agent !== 'object' || typeof agent.slug !== 'string') {
    throw new AgentHarnessError('input-validation', 'Session agent is not configured.', 500)
  }

  const resolved = await resolveAgentBySlug({ req, slug: agent.slug })

  if (!resolved.agent.streamingEnabled) {
    throw new AgentHarnessError('input-validation', 'Streaming is not enabled for this agent.', 400)
  }

  const maxInputBytes =
    typeof resolved.agent.maxInputBytes === 'number' ? resolved.agent.maxInputBytes : 20000
  const text = assertTextInput(body.text, maxInputBytes)
  const structuredInput = getStructuredInput(body, resolved.agent)
  const requestID = randomUUID()
  const startedAt = new Date()
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? `${sessionID}:${body.idempotencyKey.trim()}`
      : undefined

  if (!idempotencyKey) {
    throw new AgentHarnessError('input-validation', 'idempotencyKey is required.', 400)
  }

  if (idempotencyKey) {
    const existing = await req.payload.find({
      collection: 'agent-runs',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      req,
      user: req.user,
      where: { idempotencyKey: { equals: idempotencyKey } },
    })

    if (existing.docs[0]) return streamExistingRun(existing.docs[0])
  }

  const sequence = await getNextSequence(req, sessionID)

  await assertRunCapacity({
    agent: resolved.agent,
    agentID: String(resolved.agent.id),
    req,
    sessionID,
  })

  const run = await req.payload
    .create({
      collection: 'agent-runs',
      data: {
        agent: String(resolved.agent.id),
        idempotencyKey,
        inputPreview: toPreview(text),
        requestID,
        session: sessionID,
        sessionActiveLock: sessionID,
        startedAt: startedAt.toISOString(),
        status: 'running',
        user: req.user.id,
      },
      overrideAccess: false,
      req,
      user: req.user,
    })
    .catch(toCapacityError)

  await req.payload.create({
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

  const assistantMessage = await req.payload.create({
    collection: 'agent-messages',
    data: {
      content: '',
      role: 'assistant',
      run: run.id,
      sequence: sequence + 1,
      session: sessionID,
      status: 'streaming',
    },
    overrideAccess: false,
    req,
    user: req.user,
  })

  await req.payload.update({
    collection: 'agent-sessions',
    data: {
      lastMessageAt: startedAt.toISOString(),
      lastRunAt: startedAt.toISOString(),
      status: 'waiting',
    },
    id: sessionID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  const encoder = new TextEncoder()
  const abortController = new AbortController()
  const timeoutMS = typeof resolved.agent.timeoutMS === 'number' ? resolved.agent.timeoutMS : 30000
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abortController.abort()
  }, timeoutMS)
  const requestSignal = 'signal' in req ? (req.signal as AbortSignal | undefined) : undefined
  const abortFromClient = () => abortController.abort()
  requestSignal?.addEventListener('abort', abortFromClient, { once: true })

  let streamedExecutionID: string | undefined

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const emit = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSSE(event)))
      }

      emit({ data: { requestID, runID: String(run.id), status: 'running' }, type: 'run' })
      emit({
        data: { messageID: String(assistantMessage.id), status: 'streaming' },
        type: 'message',
      })

      try {
        const upstream = await invokeN8nAgentStream({
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
              data: structuredInput,
              text,
            },
            requestID,
            sessionID: session.externalSessionID,
          },
          server: resolved.server,
          signal: abortController.signal,
        })

        const streamResult = await streamUpstreamToSSE({
          controller,
          emit,
          onExecutionID: (executionID) => {
            streamedExecutionID = executionID
          },
          upstream,
        })
        streamedExecutionID = streamResult.n8nExecutionID
        const content = streamResult.content
        const finishedAt = new Date()
        validateConfiguredSchema({
          label: 'output',
          schema: resolved.agent.outputSchema,
          value: { content },
        })

        if (!(await isRunStillWritable(req, String(run.id)))) {
          emit({ data: { runID: String(run.id), status: 'cancelled' }, type: 'done' })
          return
        }

        await req.payload.update({
          collection: 'agent-messages',
          data: {
            content,
            status: 'complete',
          },
          id: assistantMessage.id,
          overrideAccess: false,
          req,
          user: req.user,
        })

        const updatedRun = await req.payload.update({
          collection: 'agent-runs',
          data: {
            durationMS: finishedAt.getTime() - startedAt.getTime(),
            finishedAt: finishedAt.toISOString(),
            firstByteMS: streamResult.firstByteAt
              ? streamResult.firstByteAt - startedAt.getTime()
              : undefined,
            n8nExecutionID: streamedExecutionID,
            outputPreview: toPreview(content),
            sessionActiveLock: `released:${run.id}`,
            status: 'succeeded',
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
            status: 'active',
          },
          id: sessionID,
          overrideAccess: false,
          req,
          user: req.user,
        })

        emit({
          data: { messageID: String(assistantMessage.id), status: 'complete' },
          type: 'message',
        })
        emit({ data: { runID: String(updatedRun.id), status: 'succeeded' }, type: 'done' })
      } catch (error) {
        const finishedAt = new Date()
        const harnessError =
          error instanceof AgentHarnessError
            ? error
            : error instanceof Error && error.name === 'AbortError'
              ? new AgentHarnessError(
                  timedOut ? 'upstream-timeout' : 'cancelled',
                  timedOut ? 'The agent request timed out.' : 'The agent request was cancelled.',
                  timedOut ? 504 : 499,
                )
              : new AgentHarnessError('workflow-error', 'The agent stream failed.', 502)
        const status =
          harnessError.code === 'upstream-timeout'
            ? 'timed-out'
            : harnessError.code === 'cancelled'
              ? 'cancelled'
              : 'failed'

        if ((status === 'cancelled' || status === 'timed-out') && streamedExecutionID) {
          await stopExecutionForAgent({
            agent: resolved.agent,
            executionID: streamedExecutionID,
            req,
          }).catch((stopError) => {
            Sentry.captureException(stopError, {
              tags: { area: 'agent-harness', requestID },
              extra: { n8nExecutionID: streamedExecutionID, runID: run.id },
            })
            req.payload.logger.error(
              { err: stopError, n8nExecutionID: streamedExecutionID, requestID, runID: run.id },
              'failed to stop n8n execution',
            )
          })
        }

        if (!(await isRunStillWritable(req, String(run.id)))) {
          emit({ data: { runID: String(run.id), status: 'cancelled' }, type: 'done' })
          return
        }

        await req.payload.update({
          collection: 'agent-messages',
          data: {
            content: harnessError.message,
            status: 'failed',
          },
          id: assistantMessage.id,
          overrideAccess: false,
          req,
          user: req.user,
        })

        const failedRun = await req.payload.update({
          collection: 'agent-runs',
          data: {
            durationMS: finishedAt.getTime() - startedAt.getTime(),
            errorCode: harnessError.code,
            errorMessage: harnessError.message,
            finishedAt: finishedAt.toISOString(),
            n8nExecutionID: streamedExecutionID,
            sessionActiveLock: `released:${run.id}`,
            status,
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
            status: status === 'cancelled' ? 'cancelled' : 'failed',
          },
          id: sessionID,
          overrideAccess: false,
          req,
          user: req.user,
        })

        req.payload.logger.error({ err: error, requestID, runID: run.id }, 'agent stream failed')
        Sentry.captureException(error, {
          tags: { area: 'agent-harness', requestID },
          extra: { n8nExecutionID: streamedExecutionID, runID: run.id },
        })
        emit({ data: { code: harnessError.code, message: harnessError.message }, type: 'error' })
        emit({ data: { runID: String(failedRun.id), status }, type: 'done' })
      } finally {
        clearTimeout(timeout)
        requestSignal?.removeEventListener('abort', abortFromClient)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    },
  })
}

export const listAgentMessages = async ({
  page = 1,
  req,
  sessionID,
}: {
  page?: number
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
    page,
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

export const listAgentApprovals = async ({
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
    collection: 'agent-approvals',
    depth: 1,
    limit: 10,
    overrideAccess: false,
    req,
    sort: 'expiresAt',
    user: req.user,
    where: {
      and: [{ session: { equals: sessionID } }, { status: { equals: 'pending' } }],
    },
  })
}

export const cancelAgentRun = async ({ req, runID }: { req: AgentRequest; runID: string }) => {
  const run = await req.payload.findByID({
    collection: 'agent-runs',
    depth: 2,
    id: runID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  if (!run) throw new AgentHarnessError('not-found', 'Run not found.', 404)

  if (['succeeded', 'failed', 'timed-out', 'cancelled'].includes(run.status)) {
    return run
  }

  const agent = run.agent

  if (run.n8nExecutionID && agent && typeof agent === 'object') {
    await stopExecutionForAgent({
      agent: agent as unknown as Record<string, unknown>,
      executionID: run.n8nExecutionID,
      req,
    }).catch((error) => {
      Sentry.captureException(error, {
        tags: { area: 'agent-harness', requestID: run.requestID },
        extra: { n8nExecutionID: run.n8nExecutionID, runID },
      })
      req.payload.logger.error(
        { err: error, n8nExecutionID: run.n8nExecutionID, requestID: run.requestID, runID },
        'failed to stop n8n execution',
      )
    })
  }

  const finishedAt = new Date().toISOString()
  const updatedRun = await req.payload.update({
    collection: 'agent-runs',
    data: {
      errorCode: 'cancelled',
      errorMessage: 'Run was cancelled by the user.',
      finishedAt,
      sessionActiveLock: `released:${runID}`,
      status: 'cancelled',
    },
    id: runID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  const sessionID = getRelationshipID(run.session)

  if (sessionID) {
    await req.payload.update({
      collection: 'agent-sessions',
      data: {
        lastRunAt: finishedAt,
        status: 'cancelled',
      },
      id: sessionID,
      overrideAccess: false,
      req,
      user: req.user,
    })
  }

  return updatedRun
}

export const resolveAgentApproval = async ({
  approved,
  req,
  approvalID,
  responsePayload,
}: {
  approved: boolean
  req: AgentRequest
  approvalID: string
  responsePayload?: Record<string, unknown>
}) => {
  const readableApproval = await req.payload.findByID({
    collection: 'agent-approvals',
    depth: 0,
    id: approvalID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  if (!readableApproval) throw new AgentHarnessError('not-found', 'Approval not found.', 404)
  if (readableApproval.status !== 'pending') return readableApproval

  if (readableApproval.expiresAt && new Date(readableApproval.expiresAt).getTime() < Date.now()) {
    return req.payload.update({
      collection: 'agent-approvals',
      data: {
        consumedAt: new Date().toISOString(),
        status: 'expired',
      },
      id: approvalID,
      overrideAccess: true,
    })
  }

  const consumingApproval = await req.payload.update({
    collection: 'agent-approvals',
    data: {
      resolvedBy: req.user.id,
      status: 'consuming',
    },
    id: approvalID,
    overrideAccess: true,
  })

  if (consumingApproval.status !== 'consuming') return consumingApproval

  const approval = await req.payload.findByID({
    collection: 'agent-approvals',
    depth: 2,
    id: approvalID,
    overrideAccess: true,
  })

  if (!approval?.resumeURL) {
    throw new AgentHarnessError('input-validation', 'Approval resume URL is not configured.', 500)
  }

  const agent = approval.agent
  if (!agent || typeof agent !== 'object') {
    throw new AgentHarnessError('input-validation', 'Approval agent is not configured.', 500)
  }
  const server = await getSystemServerForAgent({
    agent: agent as unknown as Record<string, unknown>,
    req,
  })
  if (!server) {
    throw new AgentHarnessError('input-validation', 'Approval agent server is not configured.', 500)
  }

  const resumeURL = assertSameServerURL({
    baseURL: (server as unknown as Record<string, unknown>).baseURL,
    targetURL: approval.resumeURL,
  })

  try {
    await fetch(resumeURL, {
      body: JSON.stringify({
        approved,
        data: responsePayload ?? {},
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
    })
  } catch (error) {
    await req.payload.update({
      collection: 'agent-approvals',
      data: {
        status: 'failed',
      },
      id: approvalID,
      overrideAccess: true,
    })
    throw error
  }

  return req.payload.update({
    collection: 'agent-approvals',
    data: {
      consumedAt: new Date().toISOString(),
      responsePayload: asPayloadJSON(responsePayload),
      resolvedBy: req.user.id,
      status: approved ? 'approved' : 'rejected',
    },
    id: approvalID,
    overrideAccess: true,
  })
}

export const updateRunFromCallback = async (
  req: JSONReadableRequest & {
    headers: { get: (name: string) => string | null }
    payload: AgentRequest['payload']
  },
) => {
  const authHeader = req.headers.get('authorization')
  if (
    !process.env.N8N_CALLBACK_SECRET ||
    authHeader !== `Bearer ${process.env.N8N_CALLBACK_SECRET}`
  ) {
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

  if (isTerminalRunStatus(run.status)) {
    return run
  }

  if (body.status === 'waiting' && body.approval && typeof body.approval === 'object') {
    const approval = body.approval as Record<string, unknown>
    const expiresAt =
      typeof approval.expiresAt === 'string'
        ? approval.expiresAt
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const sessionID = getRelationshipID(run.session)
    const agentID = getRelationshipID(run.agent)
    const userID = getRelationshipID(run.user)

    await req.payload.update({
      collection: 'agent-runs',
      data: {
        status: 'waiting',
      },
      id: run.id,
      overrideAccess: true,
    })

    if (sessionID) {
      await req.payload.update({
        collection: 'agent-sessions',
        data: {
          lastRunAt: new Date().toISOString(),
          status: 'waiting',
        },
        id: sessionID,
        overrideAccess: true,
      })
    }

    if (agentID && sessionID && userID && typeof approval.resumeURL === 'string') {
      const existingApproval = await req.payload.find({
        collection: 'agent-approvals',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          and: [{ run: { equals: run.id } }, { status: { in: ['pending', 'consuming'] } }],
        },
      })

      if (existingApproval.docs[0]) return run

      const runAgent = run.agent
      if (runAgent && typeof runAgent === 'object') {
        const server = await getSystemServerForAgent({
          agent: runAgent as unknown as Record<string, unknown>,
          req,
        })
        if (server) {
          assertSameServerURL({
            baseURL: (server as unknown as Record<string, unknown>).baseURL,
            targetURL: approval.resumeURL,
          })
        }
      }

      await req.payload.create({
        collection: 'agent-approvals',
        data: {
          agent: agentID,
          expiresAt,
          prompt:
            typeof approval.prompt === 'string'
              ? approval.prompt
              : 'This agent run is waiting for approval.',
          resumeURL: approval.resumeURL,
          run: run.id,
          session: sessionID,
          status: 'pending',
          title: typeof approval.title === 'string' ? approval.title : 'Agent approval',
          user: userID,
        },
        overrideAccess: true,
      })
    }

    return run
  }

  const status = body.status === 'failed' ? 'failed' : 'succeeded'
  const finishedAt = new Date()
  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : finishedAt.getTime()
  const content = typeof body.content === 'string' ? body.content : toPreview(body.output ?? body)
  const sessionID = getRelationshipID(run.session)
  const agentID = getRelationshipID(run.agent)

  if (status === 'succeeded' && agentID) {
    const agent = await req.payload.findByID({
      collection: 'agents',
      depth: 0,
      id: agentID,
      overrideAccess: true,
    })
    validateConfiguredSchema({
      label: 'output',
      schema: agent.outputSchema,
      value: body.data ?? body.output ?? { content },
    })
  }

  const updatedRun = await req.payload.update({
    collection: 'agent-runs',
    data: {
      durationMS: finishedAt.getTime() - startedAt,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : undefined,
      errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
      finishedAt: finishedAt.toISOString(),
      firstByteMS: typeof body.firstByteMS === 'number' ? body.firstByteMS : undefined,
      n8nExecutionID: typeof body.n8nExecutionID === 'string' ? body.n8nExecutionID : undefined,
      outputPreview: toPreview(content),
      sessionActiveLock: `released:${run.id}`,
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
  } else if (sessionID) {
    await req.payload.update({
      collection: 'agent-sessions',
      data: {
        lastRunAt: finishedAt.toISOString(),
        status: 'failed',
      },
      id: sessionID,
      overrideAccess: true,
    })
  }

  return updatedRun
}
