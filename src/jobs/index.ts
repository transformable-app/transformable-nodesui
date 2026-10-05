import type { TaskConfig } from 'payload'

import { agentRunReconciliationTask } from './agentRunReconciliation'
import { agentRetentionTask } from './agentRetention'
import { n8nSyncTask } from './n8nSync'
import { operationsMonitorTask } from './operationsMonitor'
import { recoverStuckJobs } from './recoverStuckJobs'

type JobSchedule = NonNullable<TaskConfig['schedule']>[number]

export const tasks = [
  n8nSyncTask,
  agentRunReconciliationTask,
  agentRetentionTask,
  operationsMonitorTask,
].map((task) => ({
  ...task,
  schedule: task.schedule?.map((schedule): JobSchedule => ({
    ...schedule,
    hooks: {
      ...schedule.hooks,
      beforeSchedule: async (args) => {
        await recoverStuckJobs(args.req.payload)
        return (schedule.hooks?.beforeSchedule ?? args.defaultBeforeSchedule)(args)
      },
    },
  })),
}))
