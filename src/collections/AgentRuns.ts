import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'
import { agentRunCollectionEndpoints } from '@/endpoints/agents'

const ownedRunConstraint = (userID: string) => ({ user: { equals: userID } })

export const AgentRuns: CollectionConfig = {
  slug: 'agent-runs',
  endpoints: agentRunCollectionEndpoints,
  labels: {
    plural: 'Agent Runs',
    singular: 'Agent Run',
  },
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedRunConstraint(user.id)
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedRunConstraint(user.id)
    },
  },
  admin: {
    defaultColumns: [
      'requestID',
      'agent',
      'user',
      'status',
      'startedAt',
      'firstByteMS',
      'durationMS',
    ],
    useAsTitle: 'requestID',
  },
  fields: [
    { name: 'requestID', type: 'text', required: true, unique: true, index: true },
    { name: 'idempotencyKey', type: 'text', unique: true, index: true },
    { name: 'sessionActiveLock', type: 'text', unique: true, index: true },
    { name: 'agent', type: 'relationship', relationTo: 'agents', required: true, index: true },
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'agent-sessions',
      required: true,
      index: true,
    },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'queued',
      options: ['queued', 'running', 'waiting', 'succeeded', 'failed', 'timed-out', 'cancelled'],
      required: true,
    },
    { name: 'startedAt', type: 'date' },
    { name: 'finishedAt', type: 'date' },
    { name: 'firstByteMS', type: 'number', min: 0 },
    { name: 'durationMS', type: 'number', min: 0 },
    { name: 'n8nExecutionID', type: 'text', index: true },
    { name: 'execution', type: 'relationship', relationTo: 'executions' },
    { name: 'plan', type: 'relationship', relationTo: 'agent-plans', index: true },
    { name: 'planTask', type: 'relationship', relationTo: 'agent-plan-tasks', index: true },
    { name: 'iteration', type: 'number', min: 0 },
    { name: 'inputPreview', type: 'textarea' },
    { name: 'outputPreview', type: 'textarea' },
    { name: 'errorCode', type: 'text' },
    { name: 'errorMessage', type: 'textarea' },
    { name: 'usage', type: 'json' },
    {
      name: 'remoteDraft',
      type: 'group',
      fields: [
        { name: 'payloadSite', type: 'relationship', relationTo: 'payload-sites' },
        { name: 'collection', type: 'text' },
        { name: 'documentID', type: 'text' },
        { name: 'versionID', type: 'text' },
        { name: 'operation', type: 'select', options: ['create', 'update'] },
        { name: 'status', type: 'select', options: ['created', 'published', 'failed'] },
        { name: 'adminURL', type: 'text' },
        { name: 'previewURL', type: 'text' },
        { name: 'locale', type: 'text' },
        { name: 'tenant', type: 'text' },
        { name: 'mediaIDs', type: 'json' },
        { name: 'response', type: 'json' },
        { name: 'error', type: 'textarea' },
        { name: 'lastSyncedAt', type: 'date' },
      ],
    },
    {
      name: 'feedback',
      type: 'group',
      fields: [
        { name: 'rating', type: 'number', min: 1, max: 5 },
        { name: 'comment', type: 'textarea' },
        { name: 'submittedAt', type: 'date' },
      ],
    },
  ],
  timestamps: true,
}
