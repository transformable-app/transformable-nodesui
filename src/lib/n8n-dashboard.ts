import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload, type Sort, type Where } from 'payload'

type RelationDoc = {
  id: string
  name?: string | null
  dashboardURL?: string | null
  n8nURL?: string | null
}

export type ServerCard = {
  id: string
  name?: string | null
  environment?: string | null
  status?: string | null
  dashboardURL?: string | null
  healthSummary?: string | null
  lastSyncedAt?: string | null
}

export type WorkflowCard = {
  id: string
  name?: string | null
  status?: string | null
  active?: boolean | null
  tags?: string[] | null
  n8nURL?: string | null
  lastExecutionAt?: string | null
  remoteUpdatedAt?: string | null
  server?: string | RelationDoc | null
}

export type PaginatedWorkflows = {
  docs: WorkflowCard[]
  page: number
  totalDocs: number
  totalPages: number
}

export type ExecutionCard = {
  id: string
  executionID?: string | null
  status?: string | null
  mode?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  durationMS?: number | null
  errorMessage?: string | null
  server?: string | RelationDoc | null
  workflow?: string | RelationDoc | null
}

export type PaginatedExecutions = {
  docs: ExecutionCard[]
  page: number
  totalDocs: number
  totalPages: number
}

export type CredentialCard = {
  id: string
  name?: string | null
  credentialID?: string | null
  credentialType?: string | null
  isHealthy?: boolean | null
  isGlobal?: boolean | null
  isManaged?: boolean | null
  lastUsedAt?: string | null
  remoteUpdatedAt?: string | null
  server?: string | RelationDoc | null
  summary?: string | null
}

export type PaginatedCredentials = {
  docs: CredentialCard[]
  page: number
  totalDocs: number
  totalPages: number
}

export type DataTableDoc = {
  id: string
  name?: string | null
  description?: string | null
  rowCount?: number | null
  lastRefreshedAt?: string | null
  columns?: Array<{
    key?: string | null
    label?: string | null
    name?: string | null
    displayName?: string | null
  }> | null
  server?: string | RelationDoc | null
}

export type DataTableRowDoc = {
  id: string
  createdAt?: string | null
  data?: Record<string, unknown> | null
  remoteCreatedAt?: string | null
  remoteUpdatedAt?: string | null
  rowID?: string | null
  rowIndex?: number | null
  table?: string | DataTableDoc | null
  updatedAt?: string | null
}

export type PaginatedDataTableRows = {
  docs: DataTableRowDoc[]
  page: number
  totalDocs: number
  totalPages: number
}

export type DataTableRowSortOption =
  | 'createdUpdatedDesc'
  | 'remoteCreatedDesc'
  | 'remoteUpdatedDesc'
  | 'rowIndexAsc'
  | 'rowIndexDesc'
  | 'updatedCreatedDesc'

export const dataTableRowSorts: Record<DataTableRowSortOption, Sort> = {
  createdUpdatedDesc: ['-createdAt', '-updatedAt'],
  remoteCreatedDesc: ['-remoteCreatedAt', '-createdAt'],
  remoteUpdatedDesc: ['-remoteUpdatedAt', '-updatedAt'],
  rowIndexAsc: 'rowIndex',
  rowIndexDesc: '-rowIndex',
  updatedCreatedDesc: ['-updatedAt', '-createdAt'],
}

export const resolveDataTableRowSort = (
  sort?: DataTableRowSortOption | null,
): Sort => dataTableRowSorts[sort || 'createdUpdatedDesc'] || dataTableRowSorts.createdUpdatedDesc

const getRequestPayload = async () => {
  const payload = await getPayload({ config: configPromise })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })

  return { payload, user }
}

const isAccessDeniedError = (error: unknown): error is { status?: number } =>
  Boolean(error && typeof error === 'object' && 'status' in error && error.status === 403)

const returnIfAccessDenied = <T>(error: unknown, fallback: T): T => {
  if (isAccessDeniedError(error)) {
    return fallback
  }

  throw error
}

export const getRelationName = (value?: string | RelationDoc | null) => {
  if (!value) return 'Unassigned'
  if (typeof value === 'string') return value
  return value.name || 'Untitled'
}

export const getRelationURL = (
  value?: string | RelationDoc | null,
  key?: 'dashboardURL' | 'n8nURL',
) => {
  if (!value || typeof value === 'string' || !key) return null
  return value[key] || null
}

export const getServers = async ({ limit, statuses }: { limit: number; statuses?: string[] }) => {
  const { payload, user } = await getRequestPayload()

  const where =
    statuses && statuses.length > 0
      ? {
          status: {
            in: statuses,
          },
        }
      : undefined

  try {
    const result = await payload.find({
      collection: 'servers',
      depth: 0,
      limit,
      overrideAccess: false,
      pagination: false,
      sort: 'name',
      user,
      where,
    })

    return result.docs as ServerCard[]
  } catch (error) {
    return returnIfAccessDenied(error, [] as ServerCard[])
  }
}

export const getWorkflows = async ({ limit, serverID }: { limit: number; serverID?: string }) => {
  const { payload, user } = await getRequestPayload()

  try {
    const result = await payload.find({
      collection: 'workflows',
      depth: 1,
      limit,
      overrideAccess: false,
      pagination: false,
      sort: '-remoteUpdatedAt',
      user,
      where: serverID
        ? {
            server: {
              equals: serverID,
            },
          }
        : undefined,
    })

    return result.docs as WorkflowCard[]
  } catch (error) {
    return returnIfAccessDenied(error, [] as WorkflowCard[])
  }
}

export const getPaginatedWorkflows = async ({
  limit,
  page,
  serverID,
}: {
  limit: number
  page: number
  serverID?: string
}) => {
  const { payload, user } = await getRequestPayload()

  try {
    const result = await payload.find({
      collection: 'workflows',
      depth: 1,
      limit,
      overrideAccess: false,
      page,
      pagination: true,
      sort: '-remoteUpdatedAt',
      user,
      where: serverID
        ? {
            server: {
              equals: serverID,
            },
          }
        : undefined,
    })

    return {
      docs: result.docs as WorkflowCard[],
      page: result.page,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    } as PaginatedWorkflows
  } catch (error) {
    return returnIfAccessDenied(error, {
      docs: [],
      page,
      totalDocs: 0,
      totalPages: 1,
    } as PaginatedWorkflows)
  }
}

export const getExecutions = async ({
  limit,
  onlyErrors,
  serverID,
  workflowID,
}: {
  limit: number
  onlyErrors?: boolean
  serverID?: string
  workflowID?: string
}) => {
  const { payload, user } = await getRequestPayload()

  const and: Where[] = []

  if (onlyErrors) {
    and.push({
      status: {
        equals: 'error',
      },
    })
  }

  if (serverID) {
    and.push({
      server: {
        equals: serverID,
      },
    })
  }

  if (workflowID) {
    and.push({
      workflow: {
        equals: workflowID,
      },
    })
  }

  try {
    const result = await payload.find({
      collection: 'executions',
      depth: 1,
      limit,
      overrideAccess: false,
      pagination: false,
      sort: '-startedAt',
      user,
      where: and.length > 0 ? { and } : undefined,
    })

    return result.docs as ExecutionCard[]
  } catch (error) {
    return returnIfAccessDenied(error, [] as ExecutionCard[])
  }
}

export const getPaginatedExecutions = async ({
  limit,
  onlyErrors,
  page,
  serverID,
  workflowID,
}: {
  limit: number
  onlyErrors?: boolean
  page: number
  serverID?: string
  workflowID?: string
}) => {
  const { payload, user } = await getRequestPayload()

  const and: Where[] = []

  if (onlyErrors) {
    and.push({
      status: {
        equals: 'error',
      },
    })
  }

  if (serverID) {
    and.push({
      server: {
        equals: serverID,
      },
    })
  }

  if (workflowID) {
    and.push({
      workflow: {
        equals: workflowID,
      },
    })
  }

  try {
    const result = await payload.find({
      collection: 'executions',
      depth: 1,
      limit,
      overrideAccess: false,
      page,
      pagination: true,
      sort: '-startedAt',
      user,
      where: and.length > 0 ? { and } : undefined,
    })

    return {
      docs: result.docs as ExecutionCard[],
      page: result.page,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    } as PaginatedExecutions
  } catch (error) {
    return returnIfAccessDenied(error, {
      docs: [],
      page,
      totalDocs: 0,
      totalPages: 1,
    } as PaginatedExecutions)
  }
}

export const getCredentials = async ({
  limit,
  onlyUnhealthy,
  serverID,
}: {
  limit: number
  onlyUnhealthy?: boolean
  serverID?: string
}) => {
  const { payload, user } = await getRequestPayload()

  const and: Where[] = []

  if (onlyUnhealthy) {
    and.push({
      isHealthy: {
        equals: false,
      },
    })
  }

  if (serverID) {
    and.push({
      server: {
        equals: serverID,
      },
    })
  }

  try {
    const result = await payload.find({
      collection: 'credentials',
      depth: 1,
      limit,
      overrideAccess: false,
      pagination: false,
      sort: '-remoteUpdatedAt',
      user,
      where: and.length > 0 ? { and } : undefined,
    })

    return result.docs as CredentialCard[]
  } catch (error) {
    return returnIfAccessDenied(error, [] as CredentialCard[])
  }
}

export const getPaginatedCredentials = async ({
  limit,
  onlyUnhealthy,
  page,
  serverID,
}: {
  limit: number
  onlyUnhealthy?: boolean
  page: number
  serverID?: string
}) => {
  const { payload, user } = await getRequestPayload()

  const and: Where[] = []

  if (onlyUnhealthy) {
    and.push({
      isHealthy: {
        equals: false,
      },
    })
  }

  if (serverID) {
    and.push({
      server: {
        equals: serverID,
      },
    })
  }

  try {
    const result = await payload.find({
      collection: 'credentials',
      depth: 1,
      limit,
      overrideAccess: false,
      page,
      pagination: true,
      sort: '-remoteUpdatedAt',
      user,
      where: and.length > 0 ? { and } : undefined,
    })

    return {
      docs: result.docs as CredentialCard[],
      page: result.page,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    } as PaginatedCredentials
  } catch (error) {
    return returnIfAccessDenied(error, {
      docs: [],
      page,
      totalDocs: 0,
      totalPages: 1,
    } as PaginatedCredentials)
  }
}

export const getDataTableByID = async (id: string) => {
  const { payload, user } = await getRequestPayload()

  try {
    const doc = await payload.findByID({
      collection: 'data-tables',
      depth: 1,
      id,
      overrideAccess: false,
      user,
    })

    return doc as DataTableDoc
  } catch (error) {
    return returnIfAccessDenied(error, null as DataTableDoc | null)
  }
}

export const getDataTableRows = async ({
  limit,
  page,
  sort,
  tableID,
}: {
  limit: number
  page?: number
  sort?: DataTableRowSortOption | null
  tableID: string
}) => {
  const { payload, user } = await getRequestPayload()

  try {
    const result = await payload.find({
      collection: 'data-table-rows',
      depth: 0,
      limit,
      page,
      overrideAccess: false,
      pagination: true,
      sort: resolveDataTableRowSort(sort),
      user,
      where: {
        table: {
          equals: tableID,
        },
      },
    })

    return {
      docs: result.docs as DataTableRowDoc[],
      page: result.page,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    } as PaginatedDataTableRows
  } catch (error) {
    return returnIfAccessDenied(error, {
      docs: [],
      page: page ?? 1,
      totalDocs: 0,
      totalPages: 1,
    } as PaginatedDataTableRows)
  }
}

export const getAllDataTableRows = async ({
  sort,
  tableID,
}: {
  sort?: DataTableRowSortOption | null
  tableID: string
}) => {
  const { payload, user } = await getRequestPayload()

  try {
    const result = await payload.find({
      collection: 'data-table-rows',
      depth: 0,
      overrideAccess: false,
      pagination: false,
      sort: resolveDataTableRowSort(sort),
      user,
      where: {
        table: {
          equals: tableID,
        },
      },
    })

    return result.docs as DataTableRowDoc[]
  } catch (error) {
    return returnIfAccessDenied(error, [] as DataTableRowDoc[])
  }
}
