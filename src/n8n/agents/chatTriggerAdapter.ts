import { toOutputText } from './redact'
import type { AgentInvocation, AgentInvokeResult } from './types'

export const buildChatTriggerBody = (invocation: AgentInvocation) => ({
  action: 'sendMessage',
  chatInput: invocation.input.text ?? '',
  metadata: {
    actor: invocation.actor,
    context: invocation.context,
    ...(invocation.input.data ? { input: invocation.input.data } : {}),
    requestID: invocation.requestID,
  },
  sessionId: invocation.sessionID,
})

export const parseChatTriggerResponse = (value: unknown): AgentInvokeResult => {
  if (!value || typeof value !== 'object') {
    return {
      content: toOutputText(value),
      status: 'succeeded',
    }
  }

  const data = value as Record<string, unknown>
  const contentValue = data.output ?? data.response ?? data.message ?? data.text ?? data.content
  const structuredData = data.data ?? data.output ?? (data.target && data.document ? data : undefined)

  return {
    content: toOutputText(contentValue ?? data),
    data:
      typeof structuredData === 'object' && structuredData
        ? (structuredData as Record<string, unknown>)
        : undefined,
    n8nExecutionID: typeof data.n8nExecutionID === 'string' ? data.n8nExecutionID : undefined,
    status: data.status === 'waiting' ? 'waiting' : 'succeeded',
    usage:
      typeof data.usage === 'object' && data.usage
        ? (data.usage as Record<string, unknown>)
        : undefined,
  }
}
