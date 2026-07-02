import type { Access, CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'
import { agentPlanCollectionEndpoints } from '@/n8n/agents/plans/endpoints'

const ownPlansOnly = (userID: string) => ({ createdBy: { equals: userID } })

const canUseAgentPlan: Access = ({ req: { user } }) => {
  if (!user) return false
  if (checkRole(['Admin'], user)) return true
  return ownPlansOnly(user.id)
}

export const AgentPlans: CollectionConfig = {
  slug: 'agent-plans',
  endpoints: agentPlanCollectionEndpoints,
  labels: {
    plural: 'Agent Plans',
    singular: 'Agent Plan',
  },
  access: {
    create: ({ req: { user } }) => checkRole(['Admin'], user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: canUseAgentPlan,
    update: ({ req: { user } }) => checkRole(['Admin'], user),
  },
  admin: {
    defaultColumns: ['title', 'agent', 'createdBy', 'status', 'mode', 'lastRunAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'objective', type: 'textarea', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'agent', type: 'relationship', relationTo: 'agents', required: true, index: true },
    { name: 'session', type: 'relationship', relationTo: 'agent-sessions', index: true },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        'draft',
        'validating',
        'queued',
        'running',
        'waiting',
        'paused',
        'succeeded',
        'failed',
        'cancelled',
        'blocked',
        'timed-out',
      ],
      required: true,
    },
    {
      name: 'mode',
      type: 'select',
      options: ['sequential', 'dependency', 'manual'],
      required: true,
    },
    { name: 'submittedInput', type: 'json' },
    { name: 'sharedContext', type: 'json' },
    {
      name: 'outputBinding',
      type: 'json',
      admin: {
        description:
          'Default CMS draft target binding inherited by cms-draft tasks unless a task overrides it.',
      },
    },
    {
      name: 'limits',
      type: 'group',
      fields: [
        { name: 'maxIterations', type: 'number', min: 1, max: 100, required: true },
        { name: 'maxConcurrentTasks', type: 'number', min: 1, max: 4, required: true },
        { name: 'maxTaskAttempts', type: 'number', min: 1, max: 5, required: true },
        { name: 'timeoutMS', type: 'number', min: 1000, max: 600000, required: true },
      ],
    },
    {
      name: 'approvalPolicy',
      type: 'group',
      fields: [
        { name: 'requireBeforeStart', type: 'checkbox', defaultValue: false },
        { name: 'requireBeforeWrite', type: 'checkbox', defaultValue: true },
        { name: 'requireOnRisk', type: 'checkbox', defaultValue: true },
      ],
    },
    { name: 'startedAt', type: 'date' },
    { name: 'finishedAt', type: 'date' },
    { name: 'lastRunAt', type: 'date' },
    { name: 'summary', type: 'textarea' },
    { name: 'errorCode', type: 'text' },
    { name: 'errorMessage', type: 'textarea' },
  ],
  timestamps: true,
}
