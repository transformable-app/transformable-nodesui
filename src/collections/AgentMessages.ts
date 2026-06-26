import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'

const ownedSessionConstraint = (userID: string) => ({ 'session.user': { equals: userID } })

export const AgentMessages: CollectionConfig = {
  slug: 'agent-messages',
  labels: {
    plural: 'Agent Messages',
    singular: 'Agent Message',
  },
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedSessionConstraint(user.id)
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedSessionConstraint(user.id)
    },
  },
  admin: {
    defaultColumns: ['session', 'role', 'status', 'sequence', 'createdAt'],
    useAsTitle: 'content',
  },
  fields: [
    { name: 'session', type: 'relationship', relationTo: 'agent-sessions', required: true, index: true },
    { name: 'run', type: 'relationship', relationTo: 'agent-runs', index: true },
    { name: 'sequence', type: 'number', required: true, min: 1, index: true },
    {
      name: 'role',
      type: 'select',
      options: ['user', 'assistant', 'system', 'tool'],
      required: true,
    },
    { name: 'content', type: 'textarea', required: true },
    { name: 'structuredContent', type: 'json' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'complete',
      options: ['pending', 'streaming', 'complete', 'failed'],
      required: true,
    },
    { name: 'providerMessageID', type: 'text' },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', index: true },
  ],
  timestamps: true,
}
