import { APIError, type Endpoint } from 'payload'

import {
  requireAdminUser,
  runAgentSetupGuide,
  runTestAgentSetup,
} from '@/n8n/agents/testAgentSetup'

const readBody = async (req: Parameters<Endpoint['handler']>[0]) =>
  req.json ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const setupGuideHandler: Endpoint['handler'] = async (req) => {
  try {
    requireAdminUser(req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized'
    const status = message === 'Forbidden' ? 403 : 401
    throw new APIError(message, status)
  }

  const url = new URL(req.url ?? 'http://localhost')
  const body = await readBody(req)
  const routeAgentID = getString(req.routeParams?.id)
  const agentID = routeAgentID || getString(body.agentID)
  const serverID = getString(body.serverID) || url.searchParams.get('serverID') || undefined
  const workflowID = getString(body.workflowID) || undefined
  const endpointPath = getString(body.endpointPath) || url.searchParams.get('endpointPath') || undefined
  const secretReference = getString(body.secretReference) || undefined
  const slug = getString(body.slug) || undefined
  const transport =
    body.transport === 'chat-trigger' || body.transport === 'webhook' ? body.transport : undefined
  const syncWorkflows =
    body.syncWorkflows === true || url.searchParams.get('syncWorkflows') === 'true'

  const result = await runAgentSetupGuide({
    agentID,
    endpointPath,
    req,
    secretReference,
    serverID,
    slug,
    syncWorkflows,
    transport,
    workflowID,
  })

  return Response.json(result)
}

export const agentSetupGuideEndpoint: Endpoint = {
  handler: setupGuideHandler,
  method: 'post',
  path: '/agents/setup-guide',
}

export const agentSetupGuideByIDEndpoint: Endpoint = {
  handler: setupGuideHandler,
  method: 'post',
  path: '/agents/:id/setup-guide',
}

export const testAgentSetupEndpoint: Endpoint = {
  handler: async (req) => {
    try {
      requireAdminUser(req)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized'
      const status = message === 'Forbidden' ? 403 : 401
      throw new APIError(message, status)
    }

    const url = new URL(req.url ?? 'http://localhost')
    const body = await readBody(req)
    const serverID =
      getString(body.serverID) || url.searchParams.get('serverID') || undefined
    const endpointPath =
      getString(body.endpointPath) || url.searchParams.get('endpointPath') || undefined
    const syncWorkflows =
      body.syncWorkflows === true || url.searchParams.get('syncWorkflows') === 'true'

    const result = await runTestAgentSetup({
      endpointPath,
      req,
      serverID,
      syncWorkflows,
    })

    return Response.json(result)
  },
  method: 'post',
  path: '/agents/test-setup',
}
