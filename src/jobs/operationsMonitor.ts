import type { TaskConfig } from 'payload'

import { observeFailure, resolveIncident } from '@/notifications/service'

type OperationsMonitorTask = { input: Record<string, never>; output: { checked: number; stale: number; failedJobs: number; stalledJobs: number } }

export const operationsMonitorTask: TaskConfig<OperationsMonitorTask> = {
  slug: 'operations-monitor',
  label: 'Monitor operational alerts',
  inputSchema: [],
  outputSchema: [
    { name: 'checked', type: 'number' },
    { name: 'stale', type: 'number' },
    { name: 'failedJobs', type: 'number' },
    { name: 'stalledJobs', type: 'number' },
  ],
  schedule: [{ cron: process.env.OPERATIONS_MONITOR_CRON?.trim() || '0 */5 * * * *', queue: 'n8n' }],
  handler: async ({ req }) => {
    const servers = await req.payload.find({ collection: 'servers', limit: 100, pagination: false, overrideAccess: true, where: { syncEnabled: { equals: true } } })
    const settings = await req.payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
    const multiplier = Number(settings.staleSyncMultiplier) || 3
    const intervalMS = Number(process.env.N8N_SYNC_INTERVAL_MS) || 15 * 60_000
    let stale = 0
    for (const server of servers.docs) {
      const last = server.lastSuccessfulSyncAt ? new Date(server.lastSuccessfulSyncAt).getTime() : 0
      if (!last || Date.now() - last > intervalMS * multiplier) {
        stale += 1
        await observeFailure(req.payload, { fingerprint: `n8n-stale:${server.id}`, source: 'n8n sync stale', severity: 'critical', summary: `${server.name} has not completed a successful sync within the expected interval.`, metadata: { serverID: server.id } })
      } else {
        await resolveIncident(req.payload, `n8n-stale:${server.id}`)
      }
    }
    const failedJobs = await req.payload.find({
      collection: 'payload-jobs',
      limit: 100,
      pagination: false,
      overrideAccess: true,
      where: { hasError: { equals: true } },
    })
    for (const job of failedJobs.docs) {
      await observeFailure(req.payload, {
        fingerprint: `payload-job:${job.id}`,
        source: 'Payload job failure',
        severity: 'critical',
        summary: `${job.taskSlug || 'unknown'} job ${job.id} failed.${typeof job.error === 'string' ? ` ${job.error}` : ''}`,
        metadata: { jobID: job.id, taskSlug: job.taskSlug, queue: job.queue },
      })
    }

    const stalledCutoff = new Date(Date.now() - intervalMS * multiplier).toISOString()
    const stalledJobs = await req.payload.find({
      collection: 'payload-jobs',
      limit: 100,
      pagination: false,
      overrideAccess: true,
      where: { and: [{ processing: { equals: true } }, { updatedAt: { less_than: stalledCutoff } }] },
    })
    for (const job of stalledJobs.docs) {
      await observeFailure(req.payload, {
        fingerprint: `payload-job-stalled:${job.id}`,
        source: 'Payload job stalled',
        severity: 'critical',
        summary: `${job.taskSlug || 'unknown'} job ${job.id} has remained in processing too long.`,
        metadata: { jobID: job.id, taskSlug: job.taskSlug, queue: job.queue },
      })
    }

    return { output: { checked: servers.docs.length, stale, failedJobs: failedJobs.docs.length, stalledJobs: stalledJobs.docs.length } }
  },
}
