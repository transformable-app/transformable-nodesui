export type N8nWorkflowSummary = {
  id: string
  name: string
  active?: boolean
  createdAt?: string
  updatedAt?: string
  tags?: Array<{ id?: string; name?: string } | string>
  versionId?: string
  settings?: Record<string, unknown>
  nodes?: unknown[]
  meta?: Record<string, unknown>
  shared?: unknown[]
  projectId?: string
}

export type N8nExecutionSummary = {
  id: string
  workflowId?: string
  status?: string
  mode?: string
  startedAt?: string
  stoppedAt?: string
  waitTill?: string
  retryOf?: string
  data?: unknown
  customData?: Record<string, unknown>
}

export type N8nCredentialSummary = {
  id: string
  name: string
  type: string
  isGlobal?: boolean
  isManaged?: boolean
  createdAt?: string
  updatedAt?: string
  scopes?: string[]
  data?: Record<string, unknown>
}

export type N8nDataTableSummary = {
  id: string
  name: string
  projectId?: string
  createdAt?: string
  updatedAt?: string
  columns?: Array<{
    id?: string
    index?: number
    name: string
    type: 'string' | 'number' | 'boolean' | 'date' | 'json'
  }>
  rows?: Array<Record<string, unknown> & { id?: number; createdAt?: string; updatedAt?: string }>
}

export type N8nSyncResource = 'workflows' | 'executions' | 'credentials' | 'dataTables'

export type N8nSyncTarget = {
  apiKey: string
  apiPath?: string | null
  baseURL: string
  serverID: string
  serverSlug: string
}
