import type { Payload } from 'payload'

const NON_TERMINAL_STATUSES = ['queued', 'running', 'waiting'] as const
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000

const getRelationID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }

  return null
}

export const reconcileAgentRuns = async ({
  payload,
  staleAfterMS = DEFAULT_STALE_AFTER_MS,
}: {
  payload: Payload
  staleAfterMS?: number
}) => {
  const cutoff = new Date(Date.now() - staleAfterMS).toISOString()
  const runs = await payload.find({
    collection: 'agent-runs',
    depth: 1,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [{ status: { in: NON_TERMINAL_STATUSES } }, { startedAt: { less_than: cutoff } }],
    },
  })

  let reconciled = 0

  for (const run of runs.docs) {
    const sessionID = getRelationID(run.session)
    const finishedAt = new Date().toISOString()

    await payload.update({
      collection: 'agent-runs',
      data: {
        errorCode: 'upstream-timeout',
        errorMessage: 'Run was reconciled after it was left non-terminal.',
        finishedAt,
        status: 'timed-out',
      },
      id: run.id,
      overrideAccess: true,
    })

    if (sessionID) {
      await payload.update({
        collection: 'agent-sessions',
        data: {
          lastRunAt: finishedAt,
          status: 'failed',
        },
        id: sessionID,
        overrideAccess: true,
      })
    }

    reconciled += 1
  }

  return {
    checked: runs.totalDocs,
    reconciled,
  }
}
