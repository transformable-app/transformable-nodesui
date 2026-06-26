import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'

const ownedArtifactConstraint = (userID: string) => ({ user: { equals: userID } })

export const AgentArtifacts: CollectionConfig = {
  slug: 'agent-artifacts',
  labels: {
    plural: 'Agent Artifacts',
    singular: 'Agent Artifact',
  },
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedArtifactConstraint(user.id)
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedArtifactConstraint(user.id)
    },
  },
  admin: {
    defaultColumns: ['title', 'agent', 'run', 'kind', 'expiresAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'agent', type: 'relationship', relationTo: 'agents', required: true, index: true },
    { name: 'run', type: 'relationship', relationTo: 'agent-runs', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'json',
      options: ['json', 'media', 'text', 'url'],
      required: true,
    },
    { name: 'media', type: 'upload', relationTo: 'media' },
    { name: 'data', type: 'json' },
    { name: 'text', type: 'textarea' },
    { name: 'url', type: 'text' },
    { name: 'expiresAt', type: 'date' },
  ],
  timestamps: true,
}
