import { buildAgentEndpoint } from './buildEndpoint'
import { toPreview } from './redact'
import { AgentHarnessError, type AgentInvocation, type AgentInvokeResult } from './types'

const extractResponse = (value: unknown): AgentInvokeResult => {
  if (!value || typeof value !== 'object') {
    return {
      content: typeof value === 'string' ? value : toPreview(value),
      status: 'succeeded',
    }
  }

  const data = value as Record<string, unknown>
  const contentValue = data.content ?? data.text ?? data.output ?? data.message ?? data.response
  const status = data.status === 'waiting' ? 'waiting' : 'succeeded'

  return {
    content: typeof contentValue === 'string' ? contentValue : toPreview(contentValue ?? data),
    data:
      typeof data.data === 'object' && data.data
        ? (data.data as Record<string, unknown>)
        : undefined,
    n8nExecutionID: typeof data.n8nExecutionID === 'string' ? data.n8nExecutionID : undefined,
    status,
    usage:
      typeof data.usage === 'object' && data.usage
        ? (data.usage as Record<string, unknown>)
        : undefined,
  }
}

const resolveSecret = (secretReference: unknown): string | null => {
  if (typeof secretReference !== 'string' || secretReference.trim().length === 0) return null
  return process.env[secretReference.trim()] ?? null
}

export const invokeN8nAgent = async ({
  agent,
  invocation,
  server,
}: {
  agent: Record<string, unknown>
  invocation: AgentInvocation
  server: Record<string, unknown>
}): Promise<AgentInvokeResult> => {
  const endpoint = buildAgentEndpoint({
    baseURL: server.baseURL,
    endpointPath: agent.endpointPath,
  })

  const timeoutMS = typeof agent.timeoutMS === 'number' ? agent.timeoutMS : 30000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMS)
  const headers = new Headers({ 'content-type': 'application/json' })
  const secret = resolveSecret(agent.secretReference)

  if (secret) {
    headers.set('authorization', `Bearer ${secret}`)
  }

  try {
    const transport = agent.transport === 'chat-trigger' ? 'chat-trigger' : 'webhook'
    const body =
      transport === 'chat-trigger'
        ? {
            action: 'sendMessage',
            chatInput: invocation.input.text ?? '',
            metadata: {
              actor: invocation.actor,
              context: invocation.context,
              requestID: invocation.requestID,
            },
            sessionId: invocation.sessionID,
          }
        : invocation

    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    })

    if (!response.ok) {
      const statusFamily = response.status >= 500 ? 'n8n-http-5xx' : 'n8n-http-4xx'
      throw new AgentHarnessError(statusFamily, `n8n returned HTTP ${response.status}.`, 502)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return {
        content: await response.text(),
        status: 'succeeded',
      }
    }

    return extractResponse(await response.json())
  } catch (error) {
    if (error instanceof AgentHarnessError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AgentHarnessError('upstream-timeout', 'The agent request timed out.', 504)
    }

    throw new AgentHarnessError('workflow-error', 'The agent request failed.', 502)
  } finally {
    clearTimeout(timeout)
  }
}

const resolveTransportBody = ({
  agent,
  invocation,
}: {
  agent: Record<string, unknown>
  invocation: AgentInvocation
}) => {
  const transport = agent.transport === 'chat-trigger' ? 'chat-trigger' : 'webhook'

  if (transport === 'chat-trigger') {
    return {
      action: 'sendMessage',
      chatInput: invocation.input.text ?? '',
      metadata: {
        actor: invocation.actor,
        context: invocation.context,
        requestID: invocation.requestID,
      },
      sessionId: invocation.sessionID,
    }
  }

  return invocation
}

const buildInvocationHeaders = (agent: Record<string, unknown>) => {
  const headers = new Headers({
    accept: 'text/event-stream, application/json, text/plain',
    'content-type': 'application/json',
  })
  const secret = resolveSecret(agent.secretReference)

  if (secret) {
    headers.set('authorization', `Bearer ${secret}`)
  }

  return headers
}

export const invokeN8nAgentStream = async ({
  agent,
  invocation,
  server,
  signal,
}: {
  agent: Record<string, unknown>
  invocation: AgentInvocation
  server: Record<string, unknown>
  signal?: AbortSignal
}): Promise<Response> => {
  const endpoint = buildAgentEndpoint({
    baseURL: server.baseURL,
    endpointPath: agent.endpointPath,
  })

  const response = await fetch(endpoint, {
    body: JSON.stringify(resolveTransportBody({ agent, invocation })),
    headers: buildInvocationHeaders(agent),
    method: 'POST',
    redirect: 'error',
    signal,
  })

  if (!response.ok) {
    const statusFamily = response.status >= 500 ? 'n8n-http-5xx' : 'n8n-http-4xx'
    throw new AgentHarnessError(statusFamily, `n8n returned HTTP ${response.status}.`, 502)
  }

  if (!response.body) {
    throw new AgentHarnessError('malformed-response', 'n8n returned an empty stream.', 502)
  }

  return response
}

export const stopN8nExecution = async ({
  executionID,
  server,
}: {
  executionID: string
  server: Record<string, unknown>
}) => {
  if (typeof server.baseURL !== 'string' || typeof server.apiKey !== 'string') return

  const apiPath =
    typeof server.apiPath === 'string' && server.apiPath.trim() ? server.apiPath : '/api/v1'
  const endpoint = new URL(
    `${apiPath.replace(/\/$/, '')}/executions/${executionID}/stop`,
    server.baseURL,
  )

  await fetch(endpoint, {
    headers: {
      accept: 'application/json',
      'x-n8n-api-key': server.apiKey,
    },
    method: 'POST',
    redirect: 'error',
  })
}
