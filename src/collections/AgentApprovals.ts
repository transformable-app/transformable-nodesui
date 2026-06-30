import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'
import { agentApprovalCollectionEndpoints } from '@/endpoints/agents'

const ownedApprovalConstraint = (userID: string) => ({ user: { equals: userID } })

export const AgentApprovals: CollectionConfig = {
  slug: 'agent-approvals',
  endpoints: agentApprovalCollectionEndpoints,
  labels: {
    plural: 'Agent Approvals',
    singular: 'Agent Approval',
  },
  access: {
    create: ({ req: { user } }) => checkRole(['Admin'], user),
    delete: ({ req: { user } }) => checkRole(['Admin'], user),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedApprovalConstraint(user.id)
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true
      return ownedApprovalConstraint(user.id)
    },
  },
  admin: {
    defaultColumns: ['title', 'agent', 'user', 'status', 'expiresAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'agent', type: 'relationship', relationTo: 'agents', required: true, index: true },
    { name: 'run', type: 'relationship', relationTo: 'agent-runs', required: true, index: true },
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
      defaultValue: 'pending',
      options: ['pending', 'consuming', 'approved', 'rejected', 'expired', 'failed'],
      required: true,
    },
    { name: 'prompt', type: 'textarea' },
    {
      name: 'resumeURL',
      type: 'text',
      access: {
        read: ({ req: { user } }) => checkRole(['Admin'], user),
        update: ({ req: { user } }) => checkRole(['Admin'], user),
      },
    },
    { name: 'responsePayload', type: 'json' },
    { name: 'resolvedBy', type: 'relationship', relationTo: 'users', index: true },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'consumedAt', type: 'date' },
  ],
  timestamps: true,
}
