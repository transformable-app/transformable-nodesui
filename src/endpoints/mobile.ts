import {
  APIError,
  type CollectionConfig,
  type Endpoint,
  type PayloadRequest,
  type Where,
} from 'payload'

import { checkRole } from '@/access/utilities'
import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'
import { Agents } from '@/collections/Agents'
import { Executions } from '@/collections/Executions'
import { Servers } from '@/collections/Servers'
import { Workflows } from '@/collections/Workflows'
import type { Execution, Server, Workflow } from '@/payload-types'

type MobileRequest = PayloadRequest & { user: NonNullable<PayloadRequest['user']> }
type Relation = string | { id?: string; name?: string; status?: string } | null | undefined

const requireUser = (req: PayloadRequest): MobileRequest => {
  if (!req.user) throw new APIError('Unauthorized', 401)
  return req as MobileRequest
}

const params = (req: PayloadRequest) => new URL(req.url ?? 'http://localhost').searchParams
const pageFor = (req: PayloadRequest) =>
  Math.min(100_000, Math.max(1, Math.floor(Number(params(req).get('page')) || 1)))
const limitFor = (req: PayloadRequest) =>
  Math.min(50, Math.max(1, Math.floor(Number(params(req).get('limit')) || 20)))
const plain = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const related = (value: Relation) => {
  if (!value) return null
  if (typeof value === 'string') return { id: value }
  return {
    id: value.id ?? null,
    ...(value.name ? { name: value.name } : {}),
    ...(value.status ? { status: value.status } : {}),
  }
}

const workflowSummary = (doc: Workflow) => ({
  id: doc.id,
  name: doc.name,
  workflowID: doc.workflowID,
  server: related(doc.server as Relation),
  status: doc.status,
  active: Boolean(doc.active),
  tags: doc.tags ?? [],
  lastExecutionAt: doc.lastExecutionAt ?? null,
  n8nURL: doc.n8nURL ?? null,
  updatedAt: doc.updatedAt,
})

const executionSummary = (doc: Execution, detail = false) => ({
  id: doc.id,
  executionID: doc.executionID,
  workflow: related(doc.workflow as Relation),
  server: related(doc.server as Relation),
  status: doc.status,
  mode: doc.mode ?? null,
  startedAt: doc.startedAt,
  finishedAt: doc.finishedAt ?? null,
  durationMS: doc.durationMS ?? null,
  errorMessage: doc.errorMessage?.slice(0, 500) ?? null,
  ...(detail
    ? {
        n8nURL:
          typeof doc.workflow === 'object' && doc.workflow ? (doc.workflow.n8nURL ?? null) : null,
      }
    : {}),
})

const serverSummary = (doc: Server) => ({
  id: doc.id,
  name: doc.name,
  environment: doc.environment,
  status: doc.status,
  dashboardURL: doc.dashboardURL ?? null,
  syncEnabled: Boolean(doc.syncEnabled),
  lastSyncedAt: doc.lastSyncedAt ?? null,
  lastSuccessfulSyncAt: doc.lastSuccessfulSyncAt ?? null,
  lastSyncStatus: doc.lastSyncStatus,
  lastSyncError: doc.lastSyncError?.slice(0, 500) ?? null,
})

const allowsRead = async (collection: CollectionConfig, req: MobileRequest) => {
  const read = collection.access?.read
  if (read === undefined) return true
  if (typeof read === 'function') return Boolean(await read({ req } as never))
  return Boolean(read)
}

const list = async <T>(
  req: MobileRequest,
  collection: 'workflows' | 'executions' | 'servers',
  where: Where,
  project: (doc: T) => unknown,
) => {
  const result = await req.payload.find({
    collection,
    depth: collection === 'servers' ? 0 : 1,
    limit: limitFor(req),
    page: pageFor(req),
    overrideAccess: false,
    req,
    user: req.user,
    where,
    sort: collection === 'executions' ? '-startedAt' : collection === 'servers' ? 'name' : 'name',
  })
  return {
    docs: result.docs.map((doc) => project(doc as T)),
    page: result.page,
    limit: result.limit,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
  }
}

const getIDParam = (req: PayloadRequest) => String(req.routeParams?.id ?? '')
const readBody = async (req: PayloadRequest) => {
  const body = req.json ? await req.json().catch(() => ({})) : {}
  return plain(body)
}

const mobileConfig: Endpoint = {
  path: '/mobile/config',
  method: 'get',
  handler: async (req) =>
    Response.json({
      apiVersion: 1,
      product: 'nodesui',
      deploymentID: process.env.NODESUI_DEPLOYMENT_ID || null,
      deploymentName: process.env.NODESUI_DEPLOYMENT_NAME || null,
      capabilities: [
        'monitoring',
        'workflow-failure-push',
        'agents',
        'incidents',
        'agent-commands',
      ],
    }),
}

const mobileMe: Endpoint = {
  path: '/mobile/me',
  method: 'get',
  handler: async (req) => {
    const mobileReq = requireUser(req)
    const user = mobileReq.user
    const [agentAccess, incidentAccess, monitoringAccess] = await Promise.all([
      allowsRead(Agents, mobileReq),
      adminAuthenticatedAndNotContentManager({ req: mobileReq }),
      Promise.all(
        [Executions, Workflows, Servers].map((collection) => allowsRead(collection, mobileReq)),
      ),
    ])
    return Response.json({
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      roles: user.roleNames ?? [],
      capabilities: {
        monitoring: monitoringAccess.every(Boolean),
        agents: agentAccess,
        incidents: Boolean(incidentAccess),
        agentCommands: false,
        administerServers: checkRole(['Admin'], user),
      },
    })
  },
}

const mobileDashboard: Endpoint = {
  path: '/mobile/dashboard',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const [errors, active, servers, recent, approvals, runs] = await Promise.all([
      req.payload.count({
        collection: 'executions',
        overrideAccess: false,
        req,
        user: req.user,
        where: { status: { equals: 'error' } },
      }),
      req.payload.count({
        collection: 'workflows',
        overrideAccess: false,
        req,
        user: req.user,
        where: { active: { equals: true } },
      }),
      req.payload.find({
        collection: 'servers',
        depth: 0,
        limit: 50,
        overrideAccess: false,
        req,
        user: req.user,
      }),
      req.payload.find({
        collection: 'executions',
        depth: 1,
        limit: 5,
        page: 1,
        sort: '-startedAt',
        overrideAccess: false,
        req,
        user: req.user,
      }),
      req.payload.find({
        collection: 'agent-approvals',
        depth: 0,
        limit: 50,
        overrideAccess: false,
        req,
        user: req.user,
        where: { status: { equals: 'pending' } },
      }),
      req.payload.find({
        collection: 'agent-runs',
        depth: 0,
        limit: 50,
        overrideAccess: false,
        req,
        user: req.user,
        where: { status: { in: ['queued', 'running', 'waiting'] } },
      }),
    ])
    return Response.json({
      generatedAt: new Date().toISOString(),
      metrics: {
        failedExecutions: errors.totalDocs,
        activeWorkflows: active.totalDocs,
        servers: servers.totalDocs,
        pendingApprovals: approvals.totalDocs,
        activeAgentRuns: runs.totalDocs,
      },
      servers: servers.docs.map(serverSummary),
      recentExecutions: recent.docs.map((doc) => executionSummary(doc as Execution)),
    })
  },
}

const mobileWorkflows: Endpoint = {
  path: '/mobile/workflows',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const clauses: Where[] = []
    const q = params(req).get('q')?.trim().slice(0, 100)
    const server = params(req).get('server')
    const status = params(req).get('status')
    if (q) clauses.push({ name: { contains: q } })
    if (server) clauses.push({ server: { equals: server } })
    if (status && ['active', 'paused', 'error', 'archived'].includes(status))
      clauses.push({ status: { equals: status } })
    return Response.json(
      await list<Workflow>(
        req,
        'workflows',
        clauses.length ? { and: clauses } : {},
        workflowSummary,
      ),
    )
  },
}

const mobileWorkflow: Endpoint = {
  path: '/mobile/workflows/:id',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const doc = await req.payload.findByID({
      collection: 'workflows',
      id: getIDParam(req),
      depth: 1,
      overrideAccess: false,
      req,
      user: req.user,
    })
    const [executions] = await Promise.all([
      req.payload.find({
        collection: 'executions',
        depth: 1,
        limit: 20,
        page: 1,
        sort: '-startedAt',
        overrideAccess: false,
        req,
        user: req.user,
        where: { workflow: { equals: doc.id } },
      }),
    ])
    return Response.json({
      ...workflowSummary(doc),
      executions: executions.docs.map((item) => executionSummary(item as Execution)),
    })
  },
}

const mobileExecutions: Endpoint = {
  path: '/mobile/executions',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const clauses: Where[] = []
    const status = params(req).get('status')
    const workflow = params(req).get('workflow')
    const server = params(req).get('server')
    if (status && ['success', 'error', 'running', 'waiting', 'canceled'].includes(status))
      clauses.push({ status: { equals: status } })
    if (workflow) clauses.push({ workflow: { equals: workflow } })
    if (server) clauses.push({ server: { equals: server } })
    return Response.json(
      await list<Execution>(req, 'executions', clauses.length ? { and: clauses } : {}, (doc) =>
        executionSummary(doc, true),
      ),
    )
  },
}

const mobileExecution: Endpoint = {
  path: '/mobile/executions/:id',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const doc = await req.payload.findByID({
      collection: 'executions',
      id: getIDParam(req),
      depth: 1,
      overrideAccess: false,
      req,
      user: req.user,
    })
    return Response.json(executionSummary(doc, true))
  },
}

const mobileServers: Endpoint = {
  path: '/mobile/servers',
  method: 'get',
  handler: async (request) =>
    Response.json(await list<Server>(requireUser(request), 'servers', {}, serverSummary)),
}

const mobileServer: Endpoint = {
  path: '/mobile/servers/:id',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const doc = await req.payload.findByID({
      collection: 'servers',
      id: getIDParam(req),
      depth: 0,
      overrideAccess: false,
      req,
      user: req.user,
    })
    return Response.json(serverSummary(doc))
  },
}

const mobileAgents: Endpoint = {
  path: '/mobile/agents',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const result = await req.payload.find({
      collection: 'agents',
      depth: 0,
      limit: limitFor(req),
      page: pageFor(req),
      sort: 'name',
      overrideAccess: false,
      req,
      user: req.user,
    })
    return Response.json({
      docs: result.docs.map((agent) => ({
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        description: agent.description ?? null,
        enabled: agent.enabled,
        inputMode: agent.inputMode,
        streamingEnabled: agent.streamingEnabled,
        welcomeMessage: agent.welcomeMessage ?? null,
      })),
      page: result.page,
      limit: result.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    })
  },
}

const mobileAgentSessions: Endpoint = {
  path: '/mobile/agent-sessions',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const result = await req.payload.find({
      collection: 'agent-sessions',
      depth: 1,
      limit: limitFor(req),
      page: pageFor(req),
      sort: '-lastMessageAt',
      overrideAccess: false,
      req,
      user: req.user,
    })
    return Response.json({
      docs: result.docs.map((session) => ({
        id: session.id,
        title: session.title,
        agent: related(session.agent as Relation),
        status: session.status,
        lastMessageAt: session.lastMessageAt ?? null,
        lastRunAt: session.lastRunAt ?? null,
        expiresAt: session.expiresAt ?? null,
      })),
      page: result.page,
      limit: result.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    })
  },
}

const mobileAgentRuns: Endpoint = {
  path: '/mobile/agent-runs',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const result = await req.payload.find({
      collection: 'agent-runs',
      depth: 1,
      limit: limitFor(req),
      page: pageFor(req),
      sort: '-createdAt',
      overrideAccess: false,
      req,
      user: req.user,
    })
    return Response.json({
      docs: result.docs.map((run) => ({
        id: run.id,
        requestID: run.requestID,
        agent: related(run.agent as Relation),
        session: related(run.session as Relation),
        status: run.status,
        startedAt: run.startedAt ?? null,
        finishedAt: run.finishedAt ?? null,
        durationMS: run.durationMS ?? null,
        outputPreview: run.outputPreview?.slice(0, 1000) ?? null,
        errorCode: run.errorCode ?? null,
        errorMessage: run.errorMessage?.slice(0, 500) ?? null,
      })),
      page: result.page,
      limit: result.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    })
  },
}

const mobileAgentApprovals: Endpoint = {
  path: '/mobile/agent-approvals',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const result = await req.payload.find({
      collection: 'agent-approvals',
      depth: 1,
      limit: limitFor(req),
      page: pageFor(req),
      sort: 'expiresAt',
      overrideAccess: false,
      req,
      user: req.user,
      where: { status: { equals: 'pending' } },
    })
    return Response.json({
      docs: result.docs.map((approval) => ({
        id: approval.id,
        title: approval.title,
        agent: related(approval.agent as Relation),
        run: related(approval.run as Relation),
        session: related(approval.session as Relation),
        status: approval.status,
        approvalType: approval.approvalType,
        prompt: approval.prompt?.slice(0, 2000) ?? null,
        expiresAt: approval.expiresAt,
      })),
      page: result.page,
      limit: result.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    })
  },
}

const mobileIncidents: Endpoint = {
  path: '/mobile/incidents',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const result = await req.payload.find({
      collection: 'notification-incidents',
      depth: 0,
      limit: limitFor(req),
      page: pageFor(req),
      sort: '-lastSeenAt',
      overrideAccess: false,
      req,
      user: req.user,
      where: { source: { contains: 'execution' } },
    })
    return Response.json({
      docs: result.docs.map(
        ({ id, source, severity, status, count, firstSeenAt, lastSeenAt, summary }) => ({
          id,
          source,
          severity,
          status,
          count,
          firstSeenAt,
          lastSeenAt,
          summary: summary?.slice(0, 500) ?? null,
        }),
      ),
      page: result.page,
      limit: result.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    })
  },
}

const mobileIncident: Endpoint = {
  path: '/mobile/incidents/:id',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const incident = await req.payload.findByID({
      collection: 'notification-incidents',
      id: getIDParam(req),
      depth: 0,
      overrideAccess: false,
      req,
      user: req.user,
    })
    if (!incident.source.toLowerCase().includes('execution')) throw new APIError('Not Found', 404)
    return Response.json({
      id: incident.id,
      source: incident.source,
      severity: incident.severity,
      status: incident.status,
      count: incident.count,
      firstSeenAt: incident.firstSeenAt,
      lastSeenAt: incident.lastSeenAt,
      summary: incident.summary?.slice(0, 500) ?? null,
    })
  },
}

const mobileDevice: Endpoint = {
  path: '/mobile/notifications/device',
  method: 'post',
  handler: async (request) => {
    const req = requireUser(request)
    const body = await readBody(req)
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const platform = body.platform
    if (
      !/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(token) &&
      !/^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token)
    )
      return Response.json({ error: 'A valid Expo push token is required.' }, { status: 400 })
    if (platform !== 'ios' && platform !== 'android')
      return Response.json({ error: 'platform must be ios or android.' }, { status: 400 })
    const existing = await req.payload.find({
      collection: 'mobile-devices',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { token: { equals: token } },
    })
    const current = existing.docs[0]
    const data: {
      user: string
      token: string
      platform: 'ios' | 'android'
      lastRegisteredAt: string
    } = { user: req.user.id, token, platform, lastRegisteredAt: new Date().toISOString() }
    const device = current
      ? await req.payload.update({
          collection: 'mobile-devices',
          id: current.id,
          data,
          overrideAccess: true,
          req,
        })
      : await req.payload.create({
          collection: 'mobile-devices',
          data: { ...data, workflowFailuresEnabled: false },
          overrideAccess: true,
          req,
        })
    return Response.json({
      id: device.id,
      workflowFailuresEnabled: Boolean(device.workflowFailuresEnabled),
      mutedWorkflows: device.mutedWorkflows ?? [],
    })
  },
}

const mobileNotificationPreferences: Endpoint = {
  path: '/mobile/notifications/preferences',
  method: 'get',
  handler: async (request) => {
    const req = requireUser(request)
    const devices = await req.payload.find({
      collection: 'mobile-devices',
      depth: 0,
      limit: 100,
      page: 1,
      overrideAccess: true,
      where: { user: { equals: req.user.id } },
    })
    const allDevices = [...devices.docs]
    for (let page = 2; page <= devices.totalPages; page += 1) {
      const nextPage = await req.payload.find({
        collection: 'mobile-devices',
        depth: 0,
        limit: 100,
        page,
        overrideAccess: true,
        where: { user: { equals: req.user.id } },
      })
      allDevices.push(...nextPage.docs)
    }
    const mutedWorkflowIDs = [
      ...new Set(
        allDevices.flatMap((device) =>
          (device.mutedWorkflows ?? []).map((workflow) =>
            typeof workflow === 'string' ? workflow : workflow.id,
          ),
        ),
      ),
    ]
    const accessibleMuted = mutedWorkflowIDs.length
      ? await req.payload.find({
          collection: 'workflows',
          depth: 0,
          limit: mutedWorkflowIDs.length,
          overrideAccess: false,
          req,
          user: req.user,
          where: { id: { in: mutedWorkflowIDs } },
        })
      : { docs: [] as Array<{ id: string }> }
    return Response.json({
      enabled: allDevices.some((device) => device.workflowFailuresEnabled),
      mutedWorkflowIDs: accessibleMuted.docs.map((workflow) => workflow.id),
    })
  },
}

const updateMobileNotificationPreferences: Endpoint = {
  path: '/mobile/notifications/preferences',
  method: 'patch',
  handler: async (request) => {
    const req = requireUser(request)
    const body = await readBody(req)
    if (typeof body.enabled !== 'boolean')
      return Response.json({ error: 'enabled must be a boolean.' }, { status: 400 })
    const requestedMuted = Array.isArray(body.mutedWorkflowIDs)
      ? body.mutedWorkflowIDs
          .filter((id): id is string => typeof id === 'string' && id.length <= 100)
          .slice(0, 100)
      : []
    const accessibleWorkflows = requestedMuted.length
      ? await req.payload.find({
          collection: 'workflows',
          depth: 0,
          limit: requestedMuted.length,
          overrideAccess: false,
          req,
          user: req.user,
          where: { id: { in: requestedMuted } },
        })
      : { docs: [] as Array<{ id: string }> }
    const muted = accessibleWorkflows.docs.map((workflow) => workflow.id)
    const devices = await req.payload.find({
      collection: 'mobile-devices',
      depth: 0,
      limit: 100,
      page: 1,
      overrideAccess: true,
      where: { user: { equals: req.user.id } },
    })
    const allDevices = [...devices.docs]
    for (let page = 2; page <= devices.totalPages; page += 1) {
      const nextPage = await req.payload.find({
        collection: 'mobile-devices',
        depth: 0,
        limit: 100,
        page,
        overrideAccess: true,
        where: { user: { equals: req.user.id } },
      })
      allDevices.push(...nextPage.docs)
    }
    await Promise.all(
      allDevices.map((device) =>
        req.payload.update({
          collection: 'mobile-devices',
          id: device.id,
          data: { workflowFailuresEnabled: body.enabled as boolean, mutedWorkflows: muted },
          overrideAccess: true,
          req,
        }),
      ),
    )
    return Response.json({ enabled: body.enabled, mutedWorkflowIDs: muted })
  },
}

const mobileDeviceDelete: Endpoint = {
  path: '/mobile/notifications/device',
  method: 'delete',
  handler: async (request) => {
    const req = requireUser(request)
    const body = await readBody(req)
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) return Response.json({ error: 'token is required.' }, { status: 400 })
    await req.payload.delete({
      collection: 'mobile-devices',
      where: { and: [{ token: { equals: token } }, { user: { equals: req.user.id } }] },
      overrideAccess: true,
      req,
    })
    return Response.json({ ok: true })
  },
}

export const mobileEndpoints: Endpoint[] = [
  mobileConfig,
  mobileMe,
  mobileDashboard,
  mobileWorkflows,
  mobileWorkflow,
  mobileExecutions,
  mobileExecution,
  mobileServers,
  mobileServer,
  mobileAgents,
  mobileAgentSessions,
  mobileAgentRuns,
  mobileAgentApprovals,
  mobileIncidents,
  mobileIncident,
  mobileDevice,
  mobileNotificationPreferences,
  updateMobileNotificationPreferences,
  mobileDeviceDelete,
]
