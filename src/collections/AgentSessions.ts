import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'

export const AgentSessions: CollectionConfig = {
  slug: 'agent-sessions',
  labels: {
    plural: 'Agent Sessions',
    singular: 'Agent Session',
  },
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return { user: { equals: user.id } }
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return { user: { equals: user.id } }
    },
  },
  admin: {
    defaultColumns: ['title', 'agent', 'user', 'status', 'lastMessageAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', defaultValue: 'New session' },
    { name: 'agent', type: 'relationship', relationTo: 'agents', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'externalSessionID', type: 'text', required: true, unique: true, index: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: ['active', 'waiting', 'completed', 'failed', 'cancelled'],
      required: true,
    },
    { name: 'lastMessageAt', type: 'date' },
    { name: 'lastRunAt', type: 'date' },
    { name: 'metadata', type: 'json' },
    { name: 'expiresAt', type: 'date' },
  ],
  timestamps: true,
}
