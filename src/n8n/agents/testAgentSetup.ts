import type { Payload, PayloadRequest } from 'payload'

import { checkRole } from '@/access/utilities'
import type { Agent, Server, Workflow } from '@/payload-types'
import { syncN8nResources } from '@/n8n/sync/dataTables'

export const TEST_AGENT_SLUG = 'test-agent'
export const TEST_AGENT_SECRET_REFERENCE = 'TEST_AGENT_WEBHOOK_SECRET'
export const DEFAULT_TEST_AGENT_ENDPOINT_PATH = '/webhook/test-agent'

export const TEST_AGENT_N8N_RESPONSE_EXAMPLE = {
  content: 'Harness response received',
  n8nExecutionID: 'manual-test-execution',
  status: 'succeeded',
} as const

export type AgentSetupGuideChecks = {
  agentOK: boolean
  callbackSecretOK: boolean
  invocationSecretOK: boolean
  serverOK: boolean
  workflowOK: boolean
}

/** @deprecated Use AgentSetupGuideChecks */
export type TestAgentSetupChecks = AgentSetupGuideChecks

export type WorkflowMatchReason =
  | 'endpoint-path'
  | 'fallback-recent'
  | 'linked'
  | 'linked-mismatch'
  | 'name-contains-test'

export type AgentSetupGuideResponse = {
  agent: {
    adminURL?: string
    id?: string
    name?: string
    slug: string
  } | null
  checks: AgentSetupGuideChecks
  instructions: {
    envVars: string[]
    n8nResponseExample: typeof TEST_AGENT_N8N_RESPONSE_EXAMPLE
    n8nWebhookPath: string
    secretReference: string
    transport: Agent['transport']
  }
  message: string
  mode: 'guide' | 'test-setup'
  ok: boolean
  server: {
    id: string
    name: string
  } | null
  syncWorkflows?: {
    ok: boolean
    syncedDocs?: number
  }
  workflow: {
    id: string
    matchReason: WorkflowMatchReason
    name: string
    warning?: string
  } | null
  workflowMatchWarning?: string
}

/** @deprecated Use AgentSetupGuideResponse */
export type TestAgentSetupResponse = AgentSetupGuideResponse

type WorkflowCandidate = Pick<Workflow, 'apiData' | 'id' | 'lastSeenAt' | 'name' | 'n8nURL'>

export const normalizeEndpointPath = (endpointPath: string): string => {
  const trimmed = endpointPath.trim()
  if (!trimmed) return DEFAULT_TEST_AGENT_ENDPOINT_PATH

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export const checkInvocationSecretEnv = (secretReference?: string | null): boolean => {
  const reference = secretReference?.trim() || TEST_AGENT_SECRET_REFERENCE
  return Boolean(process.env[reference])
}

export const checkCallbackSecretEnv = (): boolean => Boolean(process.env.N8N_CALLBACK_SECRET)

/** @deprecated Use checkInvocationSecretEnv */
export const checkTestAgentEnvVars = (): Pick<
  AgentSetupGuideChecks,
  'callbackSecretOK' | 'invocationSecretOK'
> => ({
  callbackSecretOK: checkCallbackSecretEnv(),
  invocationSecretOK: checkInvocationSecretEnv(TEST_AGENT_SECRET_REFERENCE),
})

const normalizePathSegment = (value: string): string =>
  value.trim().replace(/^\/+|\/+$/g, '').toLowerCase()

const collectPathLikeStrings = (value: unknown, paths: Set<string>): void => {
  if (typeof value === 'string') {
    const segment = normalizePathSegment(value)
    if (segment) paths.add(segment)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectPathLikeStrings(entry, paths))
    return
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectPathLikeStrings(entry, paths))
  }
}

export const workflowMatchesEndpointPath = (
  workflow: WorkflowCandidate,
  endpointPath: string,
): boolean => {
  const normalizedEndpoint = normalizeEndpointPath(endpointPath).toLowerCase()
  const endpointSegment = normalizePathSegment(normalizedEndpoint)
  const endpointTail = normalizedEndpoint.split('/').filter(Boolean).at(-1) || endpointSegment

  const paths = new Set<string>()
  collectPathLikeStrings(workflow.apiData, paths)

  if (workflow.n8nURL) {
    try {
      const url = new URL(workflow.n8nURL)
      const segments = url.pathname.split('/').filter(Boolean)
      const lastSegment = segments.at(-1)
      if (lastSegment) paths.add(normalizePathSegment(lastSegment))
    } catch {
      // ignore invalid URLs
    }
  }

  return [...paths].some((path) => {
    if (path === endpointSegment || path === endpointTail) return true
    if (endpointSegment.endsWith(`/${path}`) || endpointSegment.includes(`/${path}`)) return true
    return path.endsWith(`/${endpointTail}`) || path.includes(endpointTail)
  })
}

export const matchTestWorkflow = ({
  endpointPath,
  workflows,
}: {
  endpointPath: string
  workflows: WorkflowCandidate[]
}): {
  matchReason: WorkflowMatchReason
  warning?: string
  workflow: WorkflowCandidate
} | null => {
  if (workflows.length === 0) return null

  const byEndpoint = workflows.find((workflow) => workflowMatchesEndpointPath(workflow, endpointPath))
  if (byEndpoint) {
    return { matchReason: 'endpoint-path', workflow: byEndpoint }
  }

  const byName = workflows.find((workflow) => /\btest\b/i.test(workflow.name))
  if (byName) {
    return {
      matchReason: 'name-contains-test',
      warning: `Linked workflow "${byName.name}" by name match. Confirm it exposes ${endpointPath} in n8n.`,
      workflow: byName,
    }
  }

  const fallback = [...workflows].sort((left, right) => {
    const leftTime = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0
    const rightTime = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0
    return rightTime - leftTime
  })[0]

  if (!fallback) return null

  return {
    matchReason: 'fallback-recent',
    warning: `Linked most recently synced workflow "${fallback.name}". Create a dedicated webhook at ${endpointPath} in n8n.`,
    workflow: fallback,
  }
}

export const buildSmokeTestSnippet = (slug: string): string => `const sessionResponse = await fetch('/api/agents/${slug}/sessions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Harness smoke test' }),
})
const { session } = await sessionResponse.json()

const messageResponse = await fetch(\`/api/agent-sessions/\${session.id}/messages\`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    idempotencyKey: crypto.randomUUID(),
    text: 'hello from Payload',
  }),
})
await messageResponse.json()`

export const buildTestAgentDocumentData = ({
  endpointPath,
  serverID,
  userRoleID,
  workflowID,
  workflowMatchWarning,
}: {
  endpointPath: string
  serverID: string
  userRoleID?: string
  workflowID: string
  workflowMatchWarning?: string
}): Omit<Agent, 'createdAt' | 'id' | 'updatedAt'> => ({
  allowedRoles: userRoleID ? [userRoleID] : [],
  authStrategy: 'server-secret',
  configurationWarning: workflowMatchWarning || undefined,
  description: 'Canonical harness smoke-test agent created from the admin dashboard setup button.',
  enabled: true,
  endpointPath: normalizeEndpointPath(endpointPath),
  inputMode: 'chat',
  maxConcurrentRuns: 1,
  maxInputBytes: 20000,
  maxRunsPerDay: 100,
  maxRunsPerMinute: 12,
  name: 'Test Agent',
  placeholder: 'Say hello to verify the harness…',
  secretReference: TEST_AGENT_SECRET_REFERENCE,
  server: serverID,
  slug: TEST_AGENT_SLUG,
  streamingEnabled: false,
  suggestedPrompts: ['hello from Payload'],
  timeoutMS: 30000,
  transport: 'webhook',
  welcomeMessage:
    'This is the harness test agent. Open the setup guide on this record for n8n steps, then send a message or use the smoke-test snippet.',
  workflow: workflowID,
})

const getRelationID = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id.trim() ? id.trim() : undefined
  }

  return undefined
}

const resolveTargetServer = async ({
  payload,
  serverID,
}: {
  payload: Payload
  serverID?: string
}): Promise<Server | null> => {
  if (serverID) {
    try {
      return (await payload.findByID({
        collection: 'servers',
        depth: 0,
        id: serverID,
        overrideAccess: true,
      })) as Server
    } catch {
      return null
    }
  }

  const syncEnabled = await payload.find({
    collection: 'servers',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    sort: '-lastSuccessfulSyncAt',
    where: {
      syncEnabled: {
        equals: true,
      },
    },
  })

  if (syncEnabled.docs[0]) {
    return syncEnabled.docs[0] as Server
  }

  const anyServer = await payload.find({
    collection: 'servers',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    sort: 'name',
  })

  return (anyServer.docs[0] as Server | undefined) ?? null
}

const resolveUserRoleID = async (payload: Payload): Promise<string | undefined> => {
  const result = await payload.find({
    collection: 'roles',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      name: {
        equals: 'User',
      },
    },
  })

  return result.docs[0]?.id ? String(result.docs[0].id) : undefined
}

const loadWorkflowsForServer = async (payload: Payload, serverID: string): Promise<Workflow[]> => {
  const result = await payload.find({
    collection: 'workflows',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    sort: '-lastSeenAt',
    where: {
      server: {
        equals: serverID,
      },
    },
  })

  return result.docs as Workflow[]
}

const loadWorkflowByID = async (
  payload: Payload,
  workflowID?: string,
): Promise<Workflow | null> => {
  if (!workflowID) return null

  try {
    return (await payload.findByID({
      collection: 'workflows',
      depth: 0,
      id: workflowID,
      overrideAccess: true,
    })) as Workflow
  } catch {
    return null
  }
}

const hasDraftAgentFields = ({
  endpointPath,
  serverID,
  slug,
  workflowID,
}: {
  endpointPath?: string
  serverID?: string
  slug?: string
  workflowID?: string
}): boolean =>
  Boolean(slug?.trim() && serverID && workflowID && endpointPath?.trim())

export const runAgentSetupGuide = async ({
  agentID,
  endpointPath: endpointPathInput,
  req,
  secretReference: secretReferenceInput,
  serverID: serverIDInput,
  slug: slugInput,
  syncWorkflows = false,
  transport: transportInput,
  workflowID: workflowIDInput,
}: {
  agentID?: string
  endpointPath?: string
  req: PayloadRequest
  secretReference?: string
  serverID?: string
  slug?: string
  syncWorkflows?: boolean
  transport?: Agent['transport']
  workflowID?: string
}): Promise<AgentSetupGuideResponse> => {
  let agent: Agent | null = null

  if (agentID) {
    try {
      agent = (await req.payload.findByID({
        collection: 'agents',
        depth: 0,
        id: agentID,
        overrideAccess: true,
      })) as Agent
    } catch {
      agent = null
    }
  }

  const slug = slugInput?.trim() || agent?.slug || TEST_AGENT_SLUG
  const endpointPath = normalizeEndpointPath(endpointPathInput || agent?.endpointPath || DEFAULT_TEST_AGENT_ENDPOINT_PATH)
  const secretReference =
    secretReferenceInput?.trim() || agent?.secretReference?.trim() || TEST_AGENT_SECRET_REFERENCE
  const transport = transportInput || agent?.transport || 'webhook'
  const serverID = serverIDInput || getRelationID(agent?.server)
  const workflowID = workflowIDInput || getRelationID(agent?.workflow)

  const envChecks = {
    callbackSecretOK: checkCallbackSecretEnv(),
    invocationSecretOK: checkInvocationSecretEnv(secretReference),
  }

  const instructions = {
    envVars: [secretReference, 'N8N_CALLBACK_SECRET'],
    n8nResponseExample: TEST_AGENT_N8N_RESPONSE_EXAMPLE,
    n8nWebhookPath: endpointPath,
    secretReference,
    transport,
  }

  const baseChecks: AgentSetupGuideChecks = {
    agentOK: Boolean(agent?.id) || hasDraftAgentFields({ endpointPath, serverID, slug, workflowID }),
    callbackSecretOK: envChecks.callbackSecretOK,
    invocationSecretOK: envChecks.invocationSecretOK,
    serverOK: false,
    workflowOK: false,
  }

  const server = await resolveTargetServer({ payload: req.payload, serverID })
  if (!server) {
    return {
      agent: agent
        ? {
            adminURL: `/admin/collections/agents/${agent.id}`,
            id: String(agent.id),
            name: agent.name,
            slug: agent.slug,
          }
        : slug
          ? { slug }
          : null,
      checks: baseChecks,
      instructions,
      message: 'Select a server on this agent, or add a Server with sync enabled.',
      mode: 'guide',
      ok: false,
      server: null,
      workflow: null,
    }
  }

  baseChecks.serverOK = true

  let syncWorkflowsResult: AgentSetupGuideResponse['syncWorkflows']
  if (syncWorkflows) {
    try {
      const syncResult = await syncN8nResources({
        payload: req.payload,
        resources: ['workflows'],
        serverID: server.id,
      })

      syncWorkflowsResult = {
        ok: true,
        syncedDocs: syncResult.syncedDocs,
      }
    } catch {
      syncWorkflowsResult = {
        ok: false,
      }
    }
  }

  const linkedWorkflow = await loadWorkflowByID(req.payload, workflowID)
  let workflowSummary: AgentSetupGuideResponse['workflow'] = null
  let workflowMatchWarning: string | undefined

  if (linkedWorkflow) {
    const pathMatches = workflowMatchesEndpointPath(linkedWorkflow, endpointPath)
    baseChecks.workflowOK = pathMatches
    workflowSummary = {
      id: linkedWorkflow.id,
      matchReason: pathMatches ? 'linked' : 'linked-mismatch',
      name: linkedWorkflow.name,
      warning: pathMatches
        ? undefined
        : `Linked workflow "${linkedWorkflow.name}" does not appear to expose ${endpointPath}. Update n8n or choose a different workflow.`,
    }
    workflowMatchWarning = workflowSummary.warning
  } else {
    const workflows = await loadWorkflowsForServer(req.payload, server.id)
    const workflowMatch = matchTestWorkflow({ endpointPath, workflows })

    if (workflowMatch) {
      baseChecks.workflowOK = workflowMatch.matchReason === 'endpoint-path'
      workflowSummary = {
        id: workflowMatch.workflow.id,
        matchReason: workflowMatch.matchReason,
        name: workflowMatch.workflow.name,
        warning: workflowMatch.warning,
      }
      workflowMatchWarning = workflowMatch.warning
    }
  }

  const readyToInvoke =
    baseChecks.invocationSecretOK &&
    baseChecks.workflowOK &&
    baseChecks.agentOK &&
    baseChecks.serverOK

  return {
    agent: agent
      ? {
          adminURL: `/admin/collections/agents/${agent.id}`,
          id: String(agent.id),
          name: agent.name,
          slug: agent.slug,
        }
      : hasDraftAgentFields({ endpointPath, serverID: server.id, slug, workflowID })
        ? { slug }
        : null,
    checks: baseChecks,
    instructions,
    message: readyToInvoke
      ? 'Agent configuration looks ready. Run the smoke test below or invoke from a dashboard Agent Chat block.'
      : 'Complete the n8n checklist before invoking this agent.',
    mode: 'guide',
    ok: baseChecks.serverOK,
    server: { id: server.id, name: server.name },
    syncWorkflows: syncWorkflowsResult,
    workflow: workflowSummary,
    workflowMatchWarning,
  }
}

export const runTestAgentSetup = async ({
  endpointPath: endpointPathInput,
  req,
  serverID,
  syncWorkflows = false,
}: {
  endpointPath?: string
  req: PayloadRequest
  serverID?: string
  syncWorkflows?: boolean
}): Promise<AgentSetupGuideResponse> => {
  const endpointPath = normalizeEndpointPath(endpointPathInput || DEFAULT_TEST_AGENT_ENDPOINT_PATH)

  const server = await resolveTargetServer({ payload: req.payload, serverID })
  if (!server) {
    const guide = await runAgentSetupGuide({
      endpointPath,
      req,
      serverID,
      slug: TEST_AGENT_SLUG,
      syncWorkflows,
    })

    return {
      ...guide,
      message: 'Add a Server with sync enabled, then run setup again.',
      mode: 'test-setup',
      ok: false,
    }
  }

  if (syncWorkflows) {
    try {
      await syncN8nResources({
        payload: req.payload,
        resources: ['workflows'],
        serverID: server.id,
      })
    } catch {
      // runAgentSetupGuide will report sync result when called after upsert
    }
  }

  const workflows = await loadWorkflowsForServer(req.payload, server.id)
  const workflowMatch = matchTestWorkflow({ endpointPath, workflows })

  if (!workflowMatch) {
    const guide = await runAgentSetupGuide({
      endpointPath,
      req,
      serverID: server.id,
      slug: TEST_AGENT_SLUG,
      syncWorkflows,
    })

    return {
      ...guide,
      message:
        'No synced workflows found for this server. Create and activate the test webhook in n8n, then sync workflows and run setup again.',
      mode: 'test-setup',
      ok: false,
    }
  }

  const userRoleID = await resolveUserRoleID(req.payload)
  const agentData = buildTestAgentDocumentData({
    endpointPath,
    serverID: server.id,
    userRoleID,
    workflowID: workflowMatch.workflow.id,
    workflowMatchWarning: workflowMatch.warning,
  })

  const existing = await req.payload.find({
    collection: 'agents',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      slug: {
        equals: TEST_AGENT_SLUG,
      },
    },
  })

  const agent = existing.docs[0]
    ? await req.payload.update({
        collection: 'agents',
        data: agentData,
        id: existing.docs[0].id,
        overrideAccess: false,
        req,
      })
    : await req.payload.create({
        collection: 'agents',
        data: agentData,
        overrideAccess: false,
        req,
      })

  const guide = await runAgentSetupGuide({
    agentID: String(agent.id),
    req,
    syncWorkflows,
  })

  return {
    ...guide,
    mode: 'test-setup',
    ok: true,
    message: guide.checks.invocationSecretOK && guide.checks.workflowOK
      ? 'Test agent is ready. Run the smoke test below or open the agent record to verify settings.'
      : 'Agent record ready. Complete the n8n checklist before invoking the harness.',
  }
}

export const requireAdminUser = (req: PayloadRequest): void => {
  if (!req.user) {
    throw new Error('Unauthorized')
  }

  if (!checkRole(['Admin'], req.user)) {
    throw new Error('Forbidden')
  }
}
