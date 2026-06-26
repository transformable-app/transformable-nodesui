import type { Payload, TaskConfig, Where } from 'payload'

const deleteWhere = async ({
  collection,
  payload,
  where,
}: {
  collection:
    | 'agent-approvals'
    | 'agent-artifacts'
    | 'agent-messages'
    | 'agent-runs'
    | 'agent-sessions'
  payload: Payload
  where: Where
}) => {
  const result = (await payload.delete({
    collection,
    overrideAccess: true,
    where,
  } as never)) as unknown as { docs: unknown[] }

  return result.docs.length
}

type AgentRetentionTask = {
  input: {
    retentionDays?: number | null
  }
  output: {
    deletedApprovals: number
    deletedArtifacts: number
    deletedMessages: number
    deletedRuns: number
    deletedSessions: number
  }
}

export const agentRetentionTask: TaskConfig<AgentRetentionTask> = {
  slug: 'agent-retention',
  label: 'Apply agent retention',
  inputSchema: [
    {
      name: 'retentionDays',
      type: 'number',
      admin: {
        description:
          'Optional age threshold for deleting old sessions, messages, and runs. Expired approvals and artifacts are always removed.',
      },
    },
  ],
  outputSchema: [
    { name: 'deletedApprovals', type: 'number' },
    { name: 'deletedArtifacts', type: 'number' },
    { name: 'deletedMessages', type: 'number' },
    { name: 'deletedRuns', type: 'number' },
    { name: 'deletedSessions', type: 'number' },
  ],
  schedule: [
    {
      cron: process.env.AGENT_RETENTION_CRON?.trim() || '0 30 2 * * *',
      queue: 'n8n',
    },
  ],
  handler: async ({ input, req }) => {
    const now = new Date().toISOString()
    const deletedApprovals = await deleteWhere({
      collection: 'agent-approvals',
      payload: req.payload,
      where: { expiresAt: { less_than: now } },
    })
    const deletedArtifacts = await deleteWhere({
      collection: 'agent-artifacts',
      payload: req.payload,
      where: { expiresAt: { less_than: now } },
    })

    const retentionDays =
      typeof input?.retentionDays === 'number' && input.retentionDays > 0 ? input.retentionDays : 0

    if (!retentionDays) {
      return {
        output: {
          deletedApprovals,
          deletedArtifacts,
          deletedMessages: 0,
          deletedRuns: 0,
          deletedSessions: 0,
        },
      }
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    const oldRecordWhere = { createdAt: { less_than: cutoff } }
    const deletedMessages = await deleteWhere({
      collection: 'agent-messages',
      payload: req.payload,
      where: oldRecordWhere,
    })
    const deletedRuns = await deleteWhere({
      collection: 'agent-runs',
      payload: req.payload,
      where: oldRecordWhere,
    })
    const deletedSessions = await deleteWhere({
      collection: 'agent-sessions',
      payload: req.payload,
      where: oldRecordWhere,
    })

    return {
      output: {
        deletedApprovals,
        deletedArtifacts,
        deletedMessages,
        deletedRuns,
        deletedSessions,
      },
    }
  },
}
