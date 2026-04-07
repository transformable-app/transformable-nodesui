import type { Access, PayloadRequest } from 'payload'

const CONTENT_MANAGER_ROLE = 'Content Manager'
const CUSTOMER_ROLE = 'Customer'

const hasRoleName = (value: unknown): value is { name: string } => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof (value as { name?: unknown }).name === 'string',
  )
}

const getRoleID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const idValue = (value as { id?: unknown }).id
    if (typeof idValue === 'string') return idValue
  }

  return null
}

const getUserRoleValues = (user: unknown): unknown[] => {
  if (!user || typeof user !== 'object') return []

  return Array.isArray((user as { roles?: unknown }).roles)
    ? ((user as { roles?: unknown[] }).roles ?? [])
    : []
}

export const userHasRoleByName = (user: unknown, roleName: string): boolean => {
  if (!user || typeof user !== 'object') return false

  const roleNamesValue = (user as { roleNames?: unknown }).roleNames
  if (Array.isArray(roleNamesValue) && roleNamesValue.some((name) => name === roleName)) {
    return true
  }

  const roleValues = getUserRoleValues(user)
  // No roles means unrestricted/admin behavior by default.
  if (roleValues.length === 0) return false

  return roleValues.some((role) => role === roleName || (hasRoleName(role) && role.name === roleName))
}

const requestUserHasRoleByName = async (req: PayloadRequest, roleName: string): Promise<boolean> => {
  const { user } = req
  if (!user) return false

  const roleValues = getUserRoleValues(user)
  // No roles means unrestricted/admin behavior by default.
  if (roleValues.length === 0) return false

  if (roleValues.some((role) => hasRoleName(role) && role.name === roleName)) {
    return true
  }

  const roleIDs = roleValues.map(getRoleID).filter((id): id is string => Boolean(id))
  if (roleIDs.length === 0) return false

  // Intentional access bypass for internal role resolution in access checks.
  const matchingRole = await req.payload.find({
    collection: 'roles',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ id: { in: roleIDs } }, { name: { equals: roleName } }],
    },
  })

  return matchingRole.totalDocs > 0
}

export const isContentManager = async (req: PayloadRequest): Promise<boolean> => {
  return requestUserHasRoleByName(req, CONTENT_MANAGER_ROLE)
}

export const userHasContentManagerRole = (user: unknown): boolean => {
  return userHasRoleByName(user, CONTENT_MANAGER_ROLE)
}

export const userHasRestrictedManagerRole = (user: unknown): boolean => {
  return userHasContentManagerRole(user)
}

export const isCustomer = async (req: PayloadRequest): Promise<boolean> => {
  return requestUserHasRoleByName(req, CUSTOMER_ROLE)
}

export const userHasCustomerRole = (user: unknown): boolean => {
  return userHasRoleByName(user, CUSTOMER_ROLE)
}

export const authenticatedAndNotContentManager: Access = async ({ req }) => {
  if (!req.user) return false
  return !(await isContentManager(req)) && !(await isCustomer(req))
}

export const adminAuthenticatedAndNotContentManager = async ({
  req,
}: {
  req: PayloadRequest
}): Promise<boolean> => {
  if (!req.user) return false
  return !(await isContentManager(req)) && !(await isCustomer(req))
}

export const publicReadUnlessContentManager: Access = async ({ req }) => {
  if (!req.user) return true
  return !(await isContentManager(req)) && !(await isCustomer(req))
}

export const usersReadExcludingContentManager: Access = async ({ req }) => {
  if (!req.user) return false

  if ((await isContentManager(req)) || (await isCustomer(req))) {
    return {
      id: {
        equals: req.user.id,
      },
    }
  }

  return true
}
