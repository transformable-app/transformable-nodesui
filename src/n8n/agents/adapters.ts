import { buildAgentEndpoint } from './buildEndpoint'
import { buildChatTriggerBody, parseChatTriggerResponse } from './chatTriggerAdapter'
import { AgentHarnessError, type AgentInvocation, type AgentInvokeResult } from './types'
import { buildWebhookBody, parseWebhookResponse } from './webhookAdapter'

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
      transport === 'chat-trigger' ? buildChatTriggerBody(invocation) : buildWebhookBody(invocation)

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

    const responseBody = await response.json()
    return transport === 'chat-trigger'
      ? parseChatTriggerResponse(responseBody)
      : parseWebhookResponse(responseBody)
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
    return buildChatTriggerBody(invocation)
  }

  return buildWebhookBody(invocation)
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
