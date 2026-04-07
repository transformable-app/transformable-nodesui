import type { Page, Role, User } from '@/payload-types'

import { checkRole } from '@/access/utilities'

const getUserRoleIDs = (user?: User | null): string[] => {
  if (!user || !Array.isArray(user.roles)) return []

  return user.roles
    .map((role) => {
      if (typeof role === 'string') return role
      if (role && typeof role === 'object' && 'id' in role) {
        return typeof role.id === 'string' ? role.id : null
      }

      return null
    })
    .filter((id): id is string => Boolean(id))
}

const getRequiredRoleID = (requiredRole?: Page['requiredRole']): string | null => {
  if (!requiredRole) return null
  if (typeof requiredRole === 'string') return requiredRole

  return typeof (requiredRole as Role).id === 'string' ? (requiredRole as Role).id : null
}

export const canReadDashboard = ({
  page,
  user,
}: {
  page: Pick<Page, '_status' | 'requiredRole'>
  user?: User | null
}): boolean => {
  if (page._status !== 'published') return false
  if (user && checkRole(['Admin'], user)) return true
  if (!page.requiredRole) return true
  if (!user) return false

  const requiredRoleID = getRequiredRoleID(page.requiredRole)
  if (!requiredRoleID) return false

  return getUserRoleIDs(user).includes(requiredRoleID)
}
