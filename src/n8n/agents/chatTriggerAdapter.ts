import { toPreview } from './redact'
import type { AgentInvocation, AgentInvokeResult } from './types'

export const buildChatTriggerBody = (invocation: AgentInvocation) => ({
  action: 'sendMessage',
  chatInput: invocation.input.text ?? '',
  metadata: {
    actor: invocation.actor,
    context: invocation.context,
    requestID: invocation.requestID,
  },
  sessionId: invocation.sessionID,
})

export const parseChatTriggerResponse = (value: unknown): AgentInvokeResult => {
  if (!value || typeof value !== 'object') {
    return {
      content: typeof value === 'string' ? value : toPreview(value),
      status: 'succeeded',
    }
  }

  const data = value as Record<string, unknown>
  const contentValue = data.output ?? data.response ?? data.message ?? data.text ?? data.content

  return {
    content: typeof contentValue === 'string' ? contentValue : toPreview(contentValue ?? data),
    data:
      typeof data.data === 'object' && data.data
        ? (data.data as Record<string, unknown>)
        : undefined,
    n8nExecutionID: typeof data.n8nExecutionID === 'string' ? data.n8nExecutionID : undefined,
    status: data.status === 'waiting' ? 'waiting' : 'succeeded',
    usage:
      typeof data.usage === 'object' && data.usage
        ? (data.usage as Record<string, unknown>)
        : undefined,
  }
}
