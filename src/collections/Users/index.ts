import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'
import {
  authenticatedAndNotContentManager,
  userHasRestrictedManagerRole,
  usersReadExcludingContentManager,
} from '../../access/contentManagerRestrictions'

const getRoleID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const idValue = (value as { id?: unknown }).id
    if (typeof idValue === 'string') return idValue
  }

  return null
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req: { user } }) => checkRole(['Admin'], user),
    create: authenticatedAndNotContentManager,
    delete: authenticatedAndNotContentManager,
    read: usersReadExcludingContentManager,
    update: usersReadExcludingContentManager,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
    hidden: ({ user }) => Boolean(user && userHasRestrictedManagerRole(user)),
  },
  auth: {
    useAPIKey: true,
    tokenExpiration: 7 * 24 * 60 * 60,
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const nextData = data ?? {}
        const roleValues = Array.isArray(nextData.roles)
          ? nextData.roles
          : Array.isArray(originalDoc?.roles)
            ? originalDoc.roles
            : []
        const roleIDs = roleValues
          .map(getRoleID)
          .filter((id: string | null): id is string => Boolean(id))

        if (roleIDs.length === 0) {
          nextData.roleNames = []
          return nextData
        }

        const { docs } = await req.payload.find({
          collection: 'roles',
          depth: 0,
          limit: roleIDs.length,
          overrideAccess: true,
          req,
          where: {
            id: {
              in: roleIDs,
            },
          },
        })

        nextData.roleNames = docs
          .map((role) => role.name)
          .filter((name): name is string => typeof name === 'string')

        return nextData
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      saveToJWT: true,
      admin: {
        description: 'Assign one or more roles to this user.',
      },
    },
    {
      name: 'roleNames',
      type: 'text',
      hasMany: true,
      saveToJWT: true,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
  ],
  timestamps: true,
}
