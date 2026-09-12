import { agentRunReconciliationTask } from './agentRunReconciliation'
import { agentRetentionTask } from './agentRetention'
import { n8nSyncTask } from './n8nSync'
import { operationsMonitorTask } from './operationsMonitor'

export const tasks = [n8nSyncTask, agentRunReconciliationTask, agentRetentionTask, operationsMonitorTask]
