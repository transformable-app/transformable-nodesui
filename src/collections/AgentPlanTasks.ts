import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'

export const AgentPlanTasks: CollectionConfig = {
  slug: 'agent-plan-tasks',
  labels: {
    plural: 'Agent Plan Tasks',
    singular: 'Agent Plan Task',
  },
  access: {
    create: ({ req: { user } }) => checkRole(['Admin'], user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return { createdBy: { equals: user.id } }
    },
    update: ({ req: { user } }) => checkRole(['Admin'], user),
  },
  admin: {
    defaultColumns: ['taskID', 'title', 'plan', 'status', 'attempts', 'latestRun'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'plan', type: 'relationship', relationTo: 'agent-plans', required: true, index: true },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'taskID', type: 'text', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'instructions', type: 'textarea', required: true },
    {
      name: 'dependsOn',
      type: 'array',
      fields: [{ name: 'taskID', type: 'text', required: true }],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        'pending',
        'ready',
        'running',
        'waiting',
        'needs-approval',
        'succeeded',
        'failed',
        'cancelled',
        'skipped',
        'blocked',
      ],
      required: true,
    },
    { name: 'attempts', type: 'number', defaultValue: 0, min: 0, required: true },
    { name: 'maxAttempts', type: 'number', defaultValue: 2, min: 1, max: 5, required: true },
    { name: 'latestRun', type: 'relationship', relationTo: 'agent-runs', index: true },
    {
      name: 'runs',
      type: 'relationship',
      relationTo: 'agent-runs',
      hasMany: true,
    },
    { name: 'inputPreview', type: 'textarea' },
    { name: 'outputPreview', type: 'textarea' },
    { name: 'outputSummary', type: 'json' },
    { name: 'errorCode', type: 'text' },
    { name: 'errorMessage', type: 'textarea' },
    { name: 'expectedOutput', type: 'json' },
    {
      name: 'outputBinding',
      type: 'json',
      admin: {
        description:
          'Explicit CMS draft target binding enforced before remote Payload API writes.',
      },
    },
    {
      name: 'successCriteria',
      type: 'array',
      fields: [{ name: 'criterion', type: 'textarea', required: true }],
    },
    {
      name: 'riskLevel',
      type: 'select',
      defaultValue: 'low',
      options: ['low', 'medium', 'high'],
      required: true,
    },
    { name: 'requiresApproval', type: 'checkbox', defaultValue: false },
    { name: 'startedAt', type: 'date' },
    { name: 'finishedAt', type: 'date' },
  ],
  timestamps: true,
}
