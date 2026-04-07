import type { Payload, Where } from 'payload'

import type { Server } from '@/payload-types'

type SyncableServer = Pick<
  Server,
  | 'id'
  | 'apiKey'
  | 'apiPath'
  | 'baseURL'
  | 'dashboardURL'
  | 'lastSyncError'
  | 'lastSyncStatus'
  | 'lastSuccessfulSyncAt'
  | 'lastSyncedAt'
  | 'name'
  | 'syncEnabled'
>

type N8nColumn = {
  id?: number | string
  index?: number
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'json'
}

type N8nDataTable = {
  id: number | string
  name: string
  columns: N8nColumn[]
  projectId: number | string
  createdAt: string
  updatedAt: string
}

type N8nDataTableRow = Record<string, unknown> & {
  id?: number
  createdAt?: string
  updatedAt?: string
}

type CursorPage<T> = {
  data: T[]
  nextCursor?: string | null
}

type SyncServerResult = {
  resource: SyncResource
  serverID: string
  serverName: string
  syncedRows: number
  syncedTables: number
  syncedDocs: number
}

type SyncSummary = {
  results: SyncServerResult[]
  resources: SyncResource[]
  syncedDocs: number
  syncedRows: number
  syncedTables: number
}

export type SyncResource = 'credentials' | 'dataTables' | 'executions' | 'workflows'

type ServerStatus = 'online' | 'degraded' | 'offline' | 'unknown'

type N8nTag = {
  id?: string
  name?: string
}

type N8nWorkflow = {
  id: number | string
  name: string
  active?: boolean
  createdAt?: string
  updatedAt?: string
  isArchived?: boolean
  versionId?: string
  triggerCount?: number
  nodes?: unknown[]
  settings?: Record<string, unknown>
  meta?: Record<string, unknown> | null
  tags?: N8nTag[]
  shared?: Array<{ projectId?: string; role?: string; project?: { id?: string; name?: string; type?: string } }>
}

type N8nCredential = {
  id: number | string
  name: string
  type: string
  createdAt?: string
  updatedAt?: string
  isResolvable?: boolean
  shared?: Array<{ id?: string; name?: string; role?: string; createdAt?: string; updatedAt?: string }>
}

type N8nExecution = {
  id: number | string
  customData?: Record<string, unknown>
  data?: Record<string, unknown>
  finished?: boolean
  mode?: string
  retryOf?: number | string | null
  retrySuccessId?: number | string | null
  startedAt?: string
  status?: 'canceled' | 'crashed' | 'error' | 'new' | 'running' | 'success' | 'unknown' | 'waiting'
  stoppedAt?: string | null
  waitTill?: string | null
  workflowId?: number | string
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`)

const buildBaseAPIURL = (server: Pick<SyncableServer, 'apiPath' | 'baseURL'>) => {
  const baseURL = trimTrailingSlash(server.baseURL)
  const apiPath = ensureLeadingSlash(server.apiPath || '/api/v1')
  return `${baseURL}${apiPath}`
}

const buildDashboardURL = (server: Pick<SyncableServer, 'baseURL' | 'dashboardURL'>, path: string) => {
  const base = trimTrailingSlash(server.dashboardURL || server.baseURL)
  return `${base}${ensureLeadingSlash(path)}`
}

const toDateOrUndefined = (value?: string | null) => {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

const buildSourceKey = (server: Pick<SyncableServer, 'id'>, tableID: string) => `${server.id}:${tableID}`

const buildRowSourceKey = ({
  rowID,
  rowIndex,
  tableSourceKey,
}: {
  rowID?: number
  rowIndex: number
  tableSourceKey: string
}) => `${tableSourceKey}:${typeof rowID === 'number' ? rowID : `index-${rowIndex}`}`

const normalizeExecutionStatus = (status?: N8nExecution['status']) => {
  switch (status) {
    case 'canceled':
      return 'canceled' as const
    case 'crashed':
      return 'error' as const
    case 'error':
      return 'error' as const
    case 'new':
      return 'waiting' as const
    case 'running':
      return 'running' as const
    case 'success':
      return 'success' as const
    case 'unknown':
      return 'waiting' as const
    case 'waiting':
      return 'waiting' as const
    default:
      return 'waiting' as const
  }
}

const deriveWorkflowStatus = (workflow: N8nWorkflow) => {
  if (workflow.isArchived) return 'archived' as const
  if (workflow.active) return 'active' as const
  return 'paused' as const
}

const getFirstProjectID = (shared?: N8nWorkflow['shared']) =>
  shared?.find((item) => Boolean(item.projectId))?.projectId

const summarizeCredentialSharing = (credential: N8nCredential) => {
  const shares = credential.shared || []
  if (shares.length === 0) return 'Not shared with any projects.'
  const names = shares.map((item) => item.name).filter(Boolean)
  return `Shared with ${shares.length} project${shares.length === 1 ? '' : 's'}${
    names.length ? `: ${names.join(', ')}` : '.'
  }`
}

const getExecutionErrorMessage = (execution: N8nExecution) => {
  const maybeData = execution.data
  if (!maybeData || typeof maybeData !== 'object') return undefined

  const candidatePaths = [
    (maybeData as { resultData?: { error?: { message?: string } } }).resultData?.error?.message,
    (maybeData as { resultData?: { error?: { description?: string } } }).resultData?.error?.description,
    (maybeData as { error?: { message?: string } }).error?.message,
  ]

  return candidatePaths.find((value): value is string => typeof value === 'string' && value.length > 0)
}

const getExecutionErrorStack = (execution: N8nExecution) => {
  const maybeData = execution.data
  if (!maybeData || typeof maybeData !== 'object') return undefined

  const candidate =
    (maybeData as { resultData?: { error?: { stack?: string } } }).resultData?.error?.stack ||
    (maybeData as { error?: { stack?: string } }).error?.stack

  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined
}

const getDurationMS = (startedAt?: string, stoppedAt?: string | null) => {
  if (!startedAt || !stoppedAt) return undefined
  const start = new Date(startedAt).getTime()
  const end = new Date(stoppedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined
  return Math.max(0, end - start)
}

const fetchN8nPage = async <T>({
  path,
  server,
  searchParams,
}: {
  path: string
  searchParams?: URLSearchParams
  server: Pick<SyncableServer, 'apiKey' | 'apiPath' | 'baseURL'>
}): Promise<T> => {
  const url = new URL(`${buildBaseAPIURL(server)}${path}`)
  if (searchParams) {
    searchParams.forEach((value, key) => url.searchParams.set(key, value))
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-N8N-API-KEY': server.apiKey,
    },
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`n8n API request failed (${response.status}) for ${url.pathname}`)
  }

  return (await response.json()) as T
}

const fetchAllPages = async <T>({
  limit = 100,
  path,
  server,
}: {
  limit?: number
  path: string
  server: Pick<SyncableServer, 'apiKey' | 'apiPath' | 'baseURL'>
}) => {
  const data: T[] = []
  let cursor: string | undefined

  do {
    const searchParams = new URLSearchParams()
    searchParams.set('limit', String(limit))
    if (cursor) searchParams.set('cursor', cursor)

    const page = await fetchN8nPage<CursorPage<T>>({ path, searchParams, server })
    data.push(...page.data)
    cursor = page.nextCursor || undefined
  } while (cursor)

  return data
}

const resourceLabels: Record<SyncResource, string> = {
  credentials: 'credentials',
  dataTables: 'data tables',
  executions: 'executions',
  workflows: 'workflows',
}

const summarizeSyncResults = (results: SyncServerResult[]) => {
  const resources = [...new Set(results.map((result) => resourceLabels[result.resource]))]
  const syncedDocs = results.reduce((sum, result) => sum + result.syncedDocs, 0)
  const syncedRows = results.reduce((sum, result) => sum + result.syncedRows, 0)
  const syncedTables = results.reduce((sum, result) => sum + result.syncedTables, 0)

  if (resources.length === 0) return 'Sync completed. No resources were selected.'

  return `Synced ${resources.join(', ')}: ${syncedDocs} docs, ${syncedTables} tables, ${syncedRows} rows.`
}

const getServersToSync = async (payload: Payload, serverID?: string) => {
  const where: Where = serverID
    ? {
        id: {
          equals: serverID,
        },
      }
    : {
        or: [
          {
            syncEnabled: {
              equals: true,
            },
          },
          {
            syncEnabled: {
              exists: false,
            },
          },
        ],
      }

  const result = await payload.find({
    collection: 'servers',
    depth: 0,
    limit: 100,
    pagination: false,
    where,
  })

  const eligibleServers = result.docs.filter((server) => {
    return Boolean(server.apiKey && server.baseURL)
  }) as SyncableServer[]

  if (eligibleServers.length === 0) {
    throw new Error(
      serverID
        ? 'The selected server is missing one of the required sync fields: baseURL or apiKey.'
        : 'No eligible servers found. Make sure at least one server has baseURL, apiKey, and is not explicitly disabled.'
    )
  }

  return eligibleServers
}

const markServerSyncState = async ({
  payload,
  serverID,
  status,
  error,
  healthSummary,
  serverStatus,
  successful,
}: {
  error?: string | null
  healthSummary?: string
  payload: Payload
  serverID: string
  serverStatus?: ServerStatus
  status: 'running' | 'success' | 'error'
  successful?: boolean
}) => {
  await payload.update({
    collection: 'servers',
    id: serverID,
    data: {
      ...(healthSummary ? { healthSummary } : {}),
      lastSyncError: error || null,
      lastSyncStatus: status,
      lastSyncedAt: new Date().toISOString(),
      ...(successful ? { lastSuccessfulSyncAt: new Date().toISOString() } : {}),
      ...(serverStatus ? { status: serverStatus } : {}),
    },
  })
}

const syncSingleTable = async ({
  payload,
  rows,
  server,
  table,
}: {
  payload: Payload
  rows: N8nDataTableRow[]
  server: SyncableServer
  table: N8nDataTable
}) => {
  const tableID = String(table.id)
  const sourceKey = buildSourceKey(server, tableID)
  const now = new Date().toISOString()
  const existing = await payload.find({
    collection: 'data-tables',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      sourceKey: {
        equals: sourceKey,
      },
    },
  })

  const data = {
    columns: table.columns.map((column) => ({
      columnID: column.id == null ? undefined : String(column.id),
      displayName: column.name,
      index: column.index,
      key: column.name,
      label: column.name,
      name: column.name,
      type: column.type,
    })),
    description: `Mirrored from n8n Data Table API for ${server.name}.`,
    lastRefreshedAt: now,
    lastSeenAt: now,
    name: table.name,
    projectID: String(table.projectId),
    remoteCreatedAt: toDateOrUndefined(table.createdAt),
    remoteUpdatedAt: toDateOrUndefined(table.updatedAt),
    rowCount: rows.length,
    scope: 'project' as const,
    server: server.id,
    slug: sourceKey,
    sourceKey,
    sourcePath: `/data-tables/${tableID}`,
    tableID,
  }

  let dataTableID: string

  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: 'data-tables',
      id: existing.docs[0].id,
      data,
    })
    dataTableID = updated.id
  } else {
    const created = await payload.create({
      collection: 'data-tables',
      draft: false,
      data,
    })

    dataTableID = created.id
  }

  await payload.delete({
    collection: 'data-table-rows',
    context: {
      skipTableRowCountSync: true,
    },
    where: {
      table: {
        equals: dataTableID,
      },
    },
  })

  for (const [rowIndex, row] of rows.entries()) {
    const columnData = table.columns.reduce<Record<string, unknown>>((acc, column) => {
      acc[column.name] = row[column.name] ?? null
      return acc
    }, {})

    await payload.create({
      collection: 'data-table-rows',
      context: {
        skipTableRowCountSync: true,
      },
      data: {
        data: columnData,
        lastSeenAt: now,
        remoteCreatedAt: toDateOrUndefined(row.createdAt),
        remoteUpdatedAt: toDateOrUndefined(row.updatedAt),
        rowID: typeof row.id === 'number' ? String(row.id) : undefined,
        rowIndex,
        sourceKey: buildRowSourceKey({
          rowID: row.id,
          rowIndex,
          tableSourceKey: sourceKey,
        }),
        table: dataTableID,
      },
      draft: false,
    })
  }
}

const syncServerDataTables = async ({
  payload,
  server,
}: {
  payload: Payload
  server: SyncableServer
}): Promise<SyncServerResult> => {
  const tables = await fetchAllPages<N8nDataTable>({
    path: '/data-tables',
    server,
  })

  let syncedRows = 0

  for (const table of tables) {
    const rows = await fetchAllPages<N8nDataTableRow>({
      path: `/data-tables/${table.id}/rows`,
      server,
    })

    syncedRows += rows.length
    await syncSingleTable({
      payload,
      rows,
      server,
      table,
    })
  }

  return {
    resource: 'dataTables',
    serverID: server.id,
    serverName: server.name,
    syncedDocs: tables.length,
    syncedRows,
    syncedTables: tables.length,
  }
}

export const syncN8nDataTables = async ({
  payload,
  serverID,
}: {
  payload: Payload
  serverID?: string
}): Promise<SyncSummary> => {
  const servers = await getServersToSync(payload, serverID)

  const results: SyncServerResult[] = []

  for (const server of servers) {
    await markServerSyncState({
      payload,
      serverID: server.id,
      status: 'running',
      error: null,
      healthSummary: 'Sync in progress.',
    })

    try {
      const result = await syncServerDataTables({ payload, server })
      results.push(result)

      await markServerSyncState({
        payload,
        serverID: server.id,
        status: 'success',
        successful: true,
        serverStatus: 'online',
        healthSummary: summarizeSyncResults([result]),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown n8n sync error'
      await markServerSyncState({
        payload,
        serverID: server.id,
        status: 'error',
        error: message,
        serverStatus: 'offline',
        healthSummary: `Sync failed: ${message}`,
      })
      throw error
    }
  }

  return {
    results,
    resources: ['dataTables'],
    syncedDocs: results.reduce((sum, result) => sum + result.syncedDocs, 0),
    syncedRows: results.reduce((sum, result) => sum + result.syncedRows, 0),
    syncedTables: results.reduce((sum, result) => sum + result.syncedTables, 0),
  }
}

const findExistingDocBySourceKey = async ({
  collection,
  payload,
  sourceKey,
}: {
  collection: 'credentials' | 'executions' | 'workflows'
  payload: Payload
  sourceKey: string
}) => {
  const existing = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      sourceKey: {
        equals: sourceKey,
      },
    },
  })

  return existing.docs[0]
}

const findExistingWorkflow = async ({
  payload,
  serverID,
  sourceKey,
  workflowID,
}: {
  payload: Payload
  serverID: string
  sourceKey: string
  workflowID: string
}) => {
  const existingBySourceKey = await findExistingDocBySourceKey({
    collection: 'workflows',
    payload,
    sourceKey,
  })

  if (existingBySourceKey) return existingBySourceKey

  const existing = await payload.find({
    collection: 'workflows',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [
        {
          server: {
            equals: serverID,
          },
        },
        {
          workflowID: {
            equals: workflowID,
          },
        },
      ],
    },
  })

  return existing.docs[0]
}

const findExistingCredential = async ({
  credentialID,
  payload,
  serverID,
  sourceKey,
}: {
  credentialID: string
  payload: Payload
  serverID: string
  sourceKey: string
}) => {
  const existingBySourceKey = await findExistingDocBySourceKey({
    collection: 'credentials',
    payload,
    sourceKey,
  })

  if (existingBySourceKey) return existingBySourceKey

  const existing = await payload.find({
    collection: 'credentials',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [
        {
          server: {
            equals: serverID,
          },
        },
        {
          credentialID: {
            equals: credentialID,
          },
        },
      ],
    },
  })

  return existing.docs[0]
}

const findExistingExecution = async ({
  executionID,
  payload,
  serverID,
  sourceKey,
}: {
  executionID: string
  payload: Payload
  serverID: string
  sourceKey: string
}) => {
  const existingBySourceKey = await findExistingDocBySourceKey({
    collection: 'executions',
    payload,
    sourceKey,
  })

  if (existingBySourceKey) return existingBySourceKey

  const existing = await payload.find({
    collection: 'executions',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [
        {
          server: {
            equals: serverID,
          },
        },
        {
          executionID: {
            equals: executionID,
          },
        },
      ],
    },
  })

  return existing.docs[0]
}

const getWorkflowMapForServer = async (payload: Payload, serverID: string) => {
  const result = await payload.find({
    collection: 'workflows',
    depth: 0,
    limit: 1000,
    pagination: false,
    where: {
      server: {
        equals: serverID,
      },
    },
  })

  return new Map(
    result.docs.map((workflow) => {
      return [workflow.workflowID, workflow]
    }),
  )
}

const syncServerWorkflows = async ({
  payload,
  server,
}: {
  payload: Payload
  server: SyncableServer
}): Promise<SyncServerResult> => {
  const workflows = await fetchAllPages<N8nWorkflow>({
    path: '/workflows',
    server,
  })

  for (const workflow of workflows) {
    const workflowID = String(workflow.id)
    const sourceKey = buildSourceKey(server, workflowID)
    const data = {
      active: Boolean(workflow.active),
      apiData: workflow,
      lastSeenAt: new Date().toISOString(),
      name: workflow.name,
      n8nURL: buildDashboardURL(server, `/workflow/${workflowID}`),
      nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : undefined,
      projectID: getFirstProjectID(workflow.shared),
      remoteCreatedAt: toDateOrUndefined(workflow.createdAt),
      remoteUpdatedAt: toDateOrUndefined(workflow.updatedAt),
      server: server.id,
      settings: workflow.settings,
      sourceKey,
      status: deriveWorkflowStatus(workflow),
      tags: workflow.tags?.map((tag) => tag.name).filter((value): value is string => Boolean(value)),
      triggerCount: workflow.triggerCount,
      versionID: workflow.versionId,
      workflowID,
    }

    const existing = await findExistingWorkflow({
      payload,
      serverID: server.id,
      sourceKey,
      workflowID,
    })

    if (existing) {
      await payload.update({
        collection: 'workflows',
        id: existing.id,
        data,
      })
      continue
    }

    await payload.create({
      collection: 'workflows',
      draft: false,
      data,
    })
  }

  return {
    resource: 'workflows',
    serverID: server.id,
    serverName: server.name,
    syncedDocs: workflows.length,
    syncedRows: 0,
    syncedTables: 0,
  }
}

const syncServerCredentials = async ({
  payload,
  server,
}: {
  payload: Payload
  server: SyncableServer
}): Promise<SyncServerResult> => {
  const credentials = await fetchAllPages<N8nCredential>({
    path: '/credentials',
    server,
  })

  for (const credential of credentials) {
    const credentialID = String(credential.id)
    const sourceKey = buildSourceKey(server, credentialID)
    const data = {
      credentialID,
      credentialType: credential.type,
      dataPreview: undefined,
      isGlobal: false,
      isHealthy: true,
      isManaged: false,
      lastSeenAt: new Date().toISOString(),
      name: credential.name,
      remoteCreatedAt: toDateOrUndefined(credential.createdAt),
      remoteUpdatedAt: toDateOrUndefined(credential.updatedAt),
      scopes: credential.shared?.map((item) => item.role).filter((value): value is string => Boolean(value)),
      server: server.id,
      sourceKey,
      summary: summarizeCredentialSharing(credential),
    }

    const existing = await findExistingCredential({
      credentialID,
      payload,
      serverID: server.id,
      sourceKey,
    })

    if (existing) {
      await payload.update({
        collection: 'credentials',
        id: existing.id,
        data,
      })
      continue
    }

    await payload.create({
      collection: 'credentials',
      draft: false,
      data,
    })
  }

  return {
    resource: 'credentials',
    serverID: server.id,
    serverName: server.name,
    syncedDocs: credentials.length,
    syncedRows: 0,
    syncedTables: 0,
  }
}

const syncServerExecutions = async ({
  payload,
  server,
}: {
  payload: Payload
  server: SyncableServer
}): Promise<SyncServerResult> => {
  const executions = await fetchAllPages<N8nExecution>({
    path: '/executions',
    server,
  })

  const workflowMap = await getWorkflowMapForServer(payload, server.id)
  const latestExecutionByWorkflowID = new Map<string, string>()

  for (const execution of executions) {
    const executionID = String(execution.id)
    const sourceKey = buildSourceKey(server, executionID)
    const workflowID = execution.workflowId ? String(execution.workflowId) : undefined
    const relatedWorkflow = workflowID ? workflowMap.get(workflowID) : undefined
    const startedAt = toDateOrUndefined(execution.startedAt) || new Date().toISOString()

    if (workflowID && execution.startedAt) {
      const current = latestExecutionByWorkflowID.get(workflowID)
      if (!current || new Date(execution.startedAt).getTime() > new Date(current).getTime()) {
        latestExecutionByWorkflowID.set(workflowID, execution.startedAt)
      }
    }

    const data = {
      apiData: execution,
      durationMS: getDurationMS(execution.startedAt, execution.stoppedAt),
      errorMessage: getExecutionErrorMessage(execution),
      errorStack: getExecutionErrorStack(execution),
      executionID,
      finishedAt: toDateOrUndefined(execution.stoppedAt),
      lastSeenAt: new Date().toISOString(),
      mode: execution.mode,
      payloadPreview: {
        customData: execution.customData,
        finished: execution.finished,
        retrySuccessId: execution.retrySuccessId,
        workflowId: workflowID,
      },
      retryOf: execution.retryOf != null ? String(execution.retryOf) : undefined,
      server: server.id,
      sourceKey,
      startedAt,
      status: normalizeExecutionStatus(execution.status),
      waitTill: toDateOrUndefined(execution.waitTill),
      workflow: relatedWorkflow?.id,
    }

    const existing = await findExistingExecution({
      executionID,
      payload,
      serverID: server.id,
      sourceKey,
    })

    if (existing) {
      await payload.update({
        collection: 'executions',
        id: existing.id,
        data,
      })
      continue
    }

    await payload.create({
      collection: 'executions',
      draft: false,
      data,
    })
  }

  for (const [workflowID, lastExecutionAt] of latestExecutionByWorkflowID.entries()) {
    const workflow = workflowMap.get(workflowID)
    if (!workflow) continue

    await payload.update({
      collection: 'workflows',
      id: workflow.id,
      data: {
        lastExecutionAt: toDateOrUndefined(lastExecutionAt),
      },
    })
  }

  return {
    resource: 'executions',
    serverID: server.id,
    serverName: server.name,
    syncedDocs: executions.length,
    syncedRows: 0,
    syncedTables: 0,
  }
}

const runResourceSync = async ({
  payload,
  resource,
  server,
}: {
  payload: Payload
  resource: SyncResource
  server: SyncableServer
}): Promise<SyncServerResult> => {
  switch (resource) {
    case 'workflows':
      return syncServerWorkflows({ payload, server })
    case 'credentials':
      return syncServerCredentials({ payload, server })
    case 'executions':
      return syncServerExecutions({ payload, server })
    case 'dataTables':
      return syncServerDataTables({ payload, server })
  }
}

export const syncN8nResources = async ({
  payload,
  resources,
  serverID,
}: {
  payload: Payload
  resources: SyncResource[]
  serverID?: string
}): Promise<SyncSummary> => {
  const servers = await getServersToSync(payload, serverID)
  const results: SyncServerResult[] = []

  for (const server of servers) {
    await markServerSyncState({
      payload,
      serverID: server.id,
      status: 'running',
      error: null,
      healthSummary: 'Sync in progress.',
    })
    const serverResults: SyncServerResult[] = []

    try {
      for (const resource of resources) {
        const result = await runResourceSync({ payload, resource, server })
        results.push(result)
        serverResults.push(result)
      }

      await markServerSyncState({
        payload,
        serverID: server.id,
        status: 'success',
        successful: true,
        serverStatus: 'online',
        healthSummary: summarizeSyncResults(serverResults),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown n8n sync error'
      await markServerSyncState({
        payload,
        serverID: server.id,
        status: 'error',
        error: message,
        serverStatus: 'offline',
        healthSummary: `Sync failed: ${message}`,
      })
      throw error
    }
  }

  return {
    results,
    resources,
    syncedDocs: results.reduce((sum, result) => sum + result.syncedDocs, 0),
    syncedRows: results.reduce((sum, result) => sum + result.syncedRows, 0),
    syncedTables: results.reduce((sum, result) => sum + result.syncedTables, 0),
  }
}
