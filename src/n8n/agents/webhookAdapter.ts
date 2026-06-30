import { toPreview } from './redact'
import type { AgentInvocation, AgentInvokeResult } from './types'

export const buildWebhookBody = (invocation: AgentInvocation) => invocation

export const parseWebhookResponse = (value: unknown): AgentInvokeResult => {
  if (!value || typeof value !== 'object') {
    return {
      content: typeof value === 'string' ? value : toPreview(value),
      status: 'succeeded',
    }
  }

  const data = value as Record<string, unknown>
  const contentValue = data.content ?? data.text ?? data.output ?? data.message ?? data.response
  const structuredData = data.data ?? data.output
  const status =
    data.status === 'waiting' ||
    data.status === 'failed' ||
    data.status === 'needs-approval'
      ? data.status
      : 'succeeded'

  return {
    content: typeof contentValue === 'string' ? contentValue : toPreview(contentValue ?? data),
    data:
      typeof structuredData === 'object' && structuredData
        ? (structuredData as Record<string, unknown>)
        : undefined,
    n8nExecutionID: typeof data.n8nExecutionID === 'string' ? data.n8nExecutionID : undefined,
    status,
    usage:
      typeof data.usage === 'object' && data.usage
        ? (data.usage as Record<string, unknown>)
        : undefined,
  }
}
