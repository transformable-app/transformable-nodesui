import type { Endpoint, PayloadRequest } from 'payload'

import { syncN8nResources } from '@/n8n/sync/dataTables'

const allowedResources = ['all', 'credentials', 'dataTables', 'executions', 'workflows'] as const

type SyncResourceParam = (typeof allowedResources)[number]

const isAuthorized = (req: PayloadRequest) => {
  if (req.user) return true

  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

const syncHandler: Endpoint['handler'] = async (req) => {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url ?? 'http://localhost')
  const serverID = url.searchParams.get('serverID') || undefined
  const resourceParam = (url.searchParams.get('resource') || 'all') as SyncResourceParam

  if (!allowedResources.includes(resourceParam)) {
    return Response.json(
      {
        error: `Invalid resource "${resourceParam}"`,
      },
      { status: 400 },
    )
  }

  const resources =
    resourceParam === 'all'
      ? (['workflows', 'credentials', 'executions', 'dataTables'] as const)
      : ([resourceParam] as const)

  try {
    const result = await syncN8nResources({
      payload: req.payload,
      resources: [...resources],
      serverID,
    })

    return Response.json({
      ok: true,
      resource: resourceParam,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    return Response.json(
      {
        error: message,
        ok: false,
        resource: resourceParam,
      },
      { status: 500 },
    )
  }
}

export const n8nSyncEndpoints: Endpoint[] = [
  {
    handler: syncHandler,
    method: 'post',
    path: '/n8n/sync',
  },
  {
    handler: syncHandler,
    method: 'post',
    path: '/n8n/sync/data-tables',
  },
]
