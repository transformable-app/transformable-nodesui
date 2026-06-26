import type { CollectionConfig } from 'payload'

import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'

export const AgentEvaluationRuns: CollectionConfig = {
  slug: 'agent-evaluation-runs',
  labels: {
    plural: 'Agent Evaluation Runs',
    singular: 'Agent Evaluation Run',
  },
  access: {
    create: adminAuthenticatedAndNotContentManager,
    delete: adminAuthenticatedAndNotContentManager,
    read: adminAuthenticatedAndNotContentManager,
    update: adminAuthenticatedAndNotContentManager,
  },
  admin: {
    defaultColumns: ['name', 'agent', 'status', 'startedAt', 'score'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'agent', type: 'relationship', relationTo: 'agents', required: true, index: true },
    { name: 'workflow', type: 'relationship', relationTo: 'workflows', index: true },
    { name: 'dataTable', type: 'relationship', relationTo: 'data-tables', index: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'queued',
      options: ['queued', 'running', 'succeeded', 'failed'],
      required: true,
    },
    { name: 'startedAt', type: 'date' },
    { name: 'finishedAt', type: 'date' },
    { name: 'score', type: 'number' },
    { name: 'metrics', type: 'json' },
    { name: 'summary', type: 'textarea' },
    { name: 'n8nExecutionID', type: 'text', index: true },
  ],
  timestamps: true,
}
