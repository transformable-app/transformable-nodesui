import type { TaskConfig } from 'payload'

import type { SyncResource } from '@/n8n/sync/dataTables'
import { syncN8nResources } from '@/n8n/sync/dataTables'

const DEFAULT_N8N_SYNC_CRON = '0 */15 * * * *'
const n8nSyncCron = process.env.N8N_SYNC_CRON?.trim() || DEFAULT_N8N_SYNC_CRON

const allN8nSyncResources = ['workflows', 'credentials', 'executions', 'dataTables'] as const

type N8nSyncTask = {
  input: {
    resources?: SyncResource[] | null
    serverID?: string | null
  }
  output: {
    resources: SyncResource[]
    results: unknown
    serversProcessed: number
    syncedDocs: number
    syncedRows: number
    syncedTables: number
  }
}

export const n8nSyncTask: TaskConfig<N8nSyncTask> = {
  slug: 'n8n-sync',
  label: 'Sync n8n API',
  inputSchema: [
    {
      name: 'serverID',
      type: 'text',
      admin: {
        description: 'Optional Payload server document ID. Leave empty to sync every enabled server.',
      },
    },
    {
      name: 'resources',
      type: 'select',
      hasMany: true,
      defaultValue: [...allN8nSyncResources],
      options: [
        { label: 'Workflows', value: 'workflows' },
        { label: 'Credentials', value: 'credentials' },
        { label: 'Executions', value: 'executions' },
        { label: 'Data tables', value: 'dataTables' },
      ],
    },
  ],
  outputSchema: [
    {
      name: 'resources',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Workflows', value: 'workflows' },
        { label: 'Credentials', value: 'credentials' },
        { label: 'Executions', value: 'executions' },
        { label: 'Data tables', value: 'dataTables' },
      ],
    },
    {
      name: 'syncedDocs',
      type: 'number',
    },
    {
      name: 'syncedRows',
      type: 'number',
    },
    {
      name: 'syncedTables',
      type: 'number',
    },
    {
      name: 'serversProcessed',
      type: 'number',
    },
    {
      name: 'results',
      type: 'json',
    },
  ],
  schedule: [
    {
      cron: n8nSyncCron,
      queue: 'n8n',
    },
  ],
  handler: async ({ input, req }) => {
    const resources = input?.resources?.length
      ? input.resources
      : [...allN8nSyncResources]

    req.payload.logger.info(
      `n8n-sync: syncing ${resources.join(', ')}${input?.serverID ? ` for server ${input.serverID}` : ''}`,
    )

    const summary = await syncN8nResources({
      payload: req.payload,
      resources,
      serverID: input?.serverID || undefined,
    })

    return {
      output: {
        resources: summary.resources,
        results: summary.results,
        serversProcessed: new Set(summary.results.map((result) => result.serverID)).size,
        syncedDocs: summary.syncedDocs,
        syncedRows: summary.syncedRows,
        syncedTables: summary.syncedTables,
      },
    }
  },
}
