import type { User } from '@/payload-types'

const normalizeRoleName = (value: string): string => value.trim().toLowerCase()

const extractRoleName = (role: unknown): string | null => {
  if (!role) return null
  if (typeof role === 'string') return role

  if (typeof role === 'object' && 'name' in role) {
    const nameValue = (role as { name?: unknown }).name
    if (typeof nameValue === 'string') return nameValue
  }

  return null
}

export const checkRole = (allRoles: string[] = [], user?: User | null): boolean => {
  if (!user || allRoles.length === 0) return false

  const expected = new Set(allRoles.map(normalizeRoleName))
  const roleNamesFromJWT = Array.isArray(user.roleNames)
    ? user.roleNames.filter((name): name is string => typeof name === 'string')
    : []

  if (roleNamesFromJWT.some((name) => expected.has(normalizeRoleName(name)))) {
    return true
  }

  const resolvedRoleNames = Array.isArray(user.roles)
    ? user.roles.map(extractRoleName).filter((name): name is string => Boolean(name))
    : []

  return resolvedRoleNames.some((name) => expected.has(normalizeRoleName(name)))
}
