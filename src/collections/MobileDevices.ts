import type { CollectionConfig } from 'payload'
import type { User } from '@/payload-types'

import { checkRole } from '@/access/utilities'

const isAdmin = (user: unknown) => checkRole(['Admin'], user as User | null | undefined)
const ownDevices = ({ req }: { req: { user?: { id: string } | null } }) => {
  if (!req.user) return false
  if (isAdmin(req.user)) return true
  return { user: { equals: req.user.id } }
}

export const MobileDevices: CollectionConfig = {
  slug: 'mobile-devices',
  access: {
    create: ({ req: { user } }) => isAdmin(user),
    delete: ownDevices,
    read: ownDevices,
    update: ownDevices,
  },
  admin: {
    group: 'System',
    defaultColumns: ['user', 'platform', 'workflowFailuresEnabled', 'updatedAt'],
    hidden: ({ user }) => !checkRole(['Admin'], user as User | null | undefined),
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'token',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: {
        create: ({ req: { user } }) => isAdmin(user),
        read: ({ req: { user } }) => isAdmin(user),
        update: ({ req: { user } }) => isAdmin(user),
      },
      admin: { readOnly: true },
    },
    { name: 'platform', type: 'select', options: ['ios', 'android'], required: true },
    { name: 'workflowFailuresEnabled', type: 'checkbox', defaultValue: false, required: true },
    { name: 'mutedWorkflows', type: 'relationship', relationTo: 'workflows', hasMany: true },
    { name: 'lastRegisteredAt', type: 'date', required: true },
  ],
  timestamps: true,
}
