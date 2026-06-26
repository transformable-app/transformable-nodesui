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
    data: typeof data.data === 'object' && data.data ? (data.data as Record<string, unknown>) : undefined,
    n8nExecutionID: typeof data.n8nExecutionID === 'string' ? data.n8nExecutionID : undefined,
    status,
    usage: typeof data.usage === 'object' && data.usage ? (data.usage as Record<string, unknown>) : undefined,
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
