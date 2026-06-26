import type { TaskConfig } from 'payload'

import { reconcileAgentRuns } from '@/n8n/agents/reconcileRuns'

const DEFAULT_AGENT_RUN_RECONCILIATION_CRON = '0 */5 * * * *'
const agentRunReconciliationCron =
  process.env.AGENT_RUN_RECONCILIATION_CRON?.trim() || DEFAULT_AGENT_RUN_RECONCILIATION_CRON

type AgentRunReconciliationTask = {
  input: {
    staleAfterMS?: number | null
  }
  output: {
    checked: number
    reconciled: number
  }
}

export const agentRunReconciliationTask: TaskConfig<AgentRunReconciliationTask> = {
  slug: 'agent-run-reconciliation',
  label: 'Reconcile agent runs',
  inputSchema: [
    {
      name: 'staleAfterMS',
      type: 'number',
      admin: {
        description: 'Optional age threshold for non-terminal runs. Defaults to five minutes.',
      },
    },
  ],
  outputSchema: [
    {
      name: 'checked',
      type: 'number',
    },
    {
      name: 'reconciled',
      type: 'number',
    },
  ],
  schedule: [
    {
      cron: agentRunReconciliationCron,
      queue: 'n8n',
    },
  ],
  handler: async ({ input, req }) => {
    req.payload.logger.info('agent-run-reconciliation: checking stale non-terminal runs')

    const summary = await reconcileAgentRuns({
      payload: req.payload,
      staleAfterMS:
        typeof input?.staleAfterMS === 'number' && input.staleAfterMS > 0
          ? input.staleAfterMS
          : undefined,
    })

    return {
      output: summary,
    }
  },
}
