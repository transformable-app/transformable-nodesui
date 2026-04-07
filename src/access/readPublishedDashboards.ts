import type { Access, Where } from 'payload'

import { checkRole } from '@/access/utilities'

const publishedPublicDashboards: Where = {
  and: [
    {
      _status: {
        equals: 'published',
      },
    },
    {
      requiredRole: {
        exists: false,
      },
    },
  ],
}

const getUserRoleIDs = (user: unknown): string[] => {
  if (!user || typeof user !== 'object' || !Array.isArray((user as { roles?: unknown[] }).roles)) {
    return []
  }

  return ((user as { roles?: unknown[] }).roles ?? [])
    .map((role) => {
      if (typeof role === 'string') return role
      if (role && typeof role === 'object' && 'id' in role) {
        const idValue = (role as { id?: unknown }).id
        if (typeof idValue === 'string') return idValue
      }

      return null
    })
    .filter((id): id is string => Boolean(id))
}

export const readPublishedDashboards: Access = ({ req: { user } }) => {
  if (user && checkRole(['Admin'], user)) {
    return true
  }

  const roleIDs = getUserRoleIDs(user)

  if (roleIDs.length === 0) {
    return publishedPublicDashboards
  }

  return {
    or: [
      publishedPublicDashboards,
      {
        and: [
          {
            _status: {
              equals: 'published',
            },
          },
          {
            requiredRole: {
              in: roleIDs,
            },
          },
        ],
      },
    ],
  }
}
