import type { CollectionConfig } from 'payload'

import {
  adminAuthenticatedAndNotContentManager,
  authenticatedAndNotContentManager,
  userHasRestrictedManagerRole,
} from '../access/contentManagerRestrictions'

export const Roles: CollectionConfig = {
  slug: 'roles',
  access: {
    admin: adminAuthenticatedAndNotContentManager,
    create: authenticatedAndNotContentManager,
    delete: authenticatedAndNotContentManager,
    read: authenticatedAndNotContentManager,
    update: authenticatedAndNotContentManager,
  },
  admin: {
    useAsTitle: 'name',
    hidden: ({ user }) => Boolean(user && userHasRestrictedManagerRole(user)),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
    },
  ],
}
