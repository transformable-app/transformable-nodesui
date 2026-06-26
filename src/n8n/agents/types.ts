import type { PayloadRequest } from 'payload'

import type { User } from '@/payload-types'

export type AgentTransport = 'chat-trigger' | 'webhook'

export type AgentInvocation = {
  requestID: string
  sessionID: string
  input: {
    text?: string
    data?: Record<string, unknown>
  }
  actor: {
    id: string
    roles: string[]
  }
  context?: Record<string, unknown>
}

export type AgentInvokeResult = {
  content: string
  data?: Record<string, unknown>
  n8nExecutionID?: string
  status: 'succeeded' | 'waiting'
  usage?: Record<string, unknown>
}

export type ResolvedAgent = {
  agent: Record<string, unknown>
  server: Record<string, unknown>
  workflow?: Record<string, unknown> | string
}

export type AgentRequest = PayloadRequest & {
  user: User
}

export type AgentErrorCode =
  | 'input-validation'
  | 'auth'
  | 'not-found'
  | 'rate-limited'
  | 'upstream-timeout'
  | 'n8n-http-4xx'
  | 'n8n-http-5xx'
  | 'malformed-response'
  | 'workflow-error'
  | 'cancelled'

export class AgentHarnessError extends Error {
  code: AgentErrorCode
  status: number

  constructor(code: AgentErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'AgentHarnessError'
    this.code = code
    this.status = status
  }
}
