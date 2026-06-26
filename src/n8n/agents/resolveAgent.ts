import { AgentHarnessError, type AgentRequest, type ResolvedAgent } from './types'
import { checkRole } from '@/access/utilities'

const getRelationID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }

  return null
}

const getRoleName = (value: unknown): string | null => {
  if (typeof value === 'string') return null
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name
    return typeof name === 'string' ? name : null
  }

  return null
}

export const userCanInvokeAgent = (agent: Record<string, unknown>, user: AgentRequest['user']) => {
  if (checkRole(['Admin'], user)) return true

  const allowedRoles = Array.isArray(agent.allowedRoles) ? agent.allowedRoles : []
  const allowedRoleNames = allowedRoles.map(getRoleName).filter((name): name is string => Boolean(name))

  if (allowedRoleNames.length === 0) return false

  return checkRole(allowedRoleNames, user)
}

export const resolveAgentBySlug = async ({
  req,
  slug,
}: {
  req: AgentRequest
  slug: string
}): Promise<ResolvedAgent> => {
  const result = await req.payload.find({
    collection: 'agents',
    depth: 2,
    limit: 1,
    overrideAccess: false,
    req,
    user: req.user,
    where: {
      and: [{ slug: { equals: slug } }, { enabled: { equals: true } }],
    },
  })

  const agent = result.docs[0] as unknown as Record<string, unknown> | undefined

  if (!agent || !userCanInvokeAgent(agent, req.user)) {
    throw new AgentHarnessError('not-found', 'Agent not found.', 404)
  }

  const server = agent.server
  if (!server || typeof server !== 'object') {
    throw new AgentHarnessError('input-validation', 'Agent server is not configured.', 500)
  }

  return {
    agent,
    server: server as Record<string, unknown>,
    workflow: agent.workflow as Record<string, unknown> | string | undefined,
  }
}

export const getRelationshipID = getRelationID
