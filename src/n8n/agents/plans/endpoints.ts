import { APIError, type Endpoint } from 'payload'

import { cancelAgentRun } from '@/n8n/agents/invokeAgent'
import { AgentHarnessError } from '@/n8n/agents/types'

import { createAgentPlan } from './createPlan'
import { runPlanLoop } from './runPlanLoop'
import { validateAgentPlanInput } from './validatePlan'

const readBody = async (req: Parameters<Endpoint['handler']>[0]) =>
  req.json ? ((await req.json().catch(() => ({}))) as unknown) : {}

const handlePlanError = (error: unknown): Response => {
  if (error instanceof AgentHarnessError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  if (error instanceof APIError) {
    return Response.json({ error: error.message }, { status: error.status || 500 })
  }

  throw error
}

const requireUser = (req: Parameters<Endpoint['handler']>[0]) => {
  if (!req.user) throw new AgentHarnessError('auth', 'Unauthorized.', 401)
}

export const agentPlanCollectionEndpoints: Endpoint[] = [
  {
    path: '/validate',
    method: 'post',
    handler: async (req) => {
      try {
        requireUser(req)
        const result = validateAgentPlanInput(await readBody(req))

        if (!result.ok) {
          return Response.json({ errors: result.errors, ok: false }, { status: 400 })
        }

        return Response.json({ ok: true, plan: result.redactedPlan })
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
  {
    path: '/start',
    method: 'post',
    handler: async (req) => {
      try {
        requireUser(req)
        const result = await createAgentPlan({ input: await readBody(req), req, start: true })
        return Response.json(result)
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
  {
    path: '/:id/pause',
    method: 'post',
    handler: async (req) => {
      try {
        requireUser(req)
        const planID = String(req.routeParams?.id ?? '')
        await req.payload.findByID({
          collection: 'agent-plans',
          depth: 0,
          id: planID,
          overrideAccess: false,
          req,
          user: req.user,
        })
        const plan = await req.payload.update({
          collection: 'agent-plans',
          data: { status: 'paused' },
          id: planID,
          overrideAccess: true,
          req,
        })
        return Response.json({ plan })
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
  {
    path: '/:id/resume',
    method: 'post',
    handler: async (req) => {
      try {
        requireUser(req)
        const planID = String(req.routeParams?.id ?? '')
        await req.payload.findByID({
          collection: 'agent-plans',
          depth: 0,
          id: planID,
          overrideAccess: false,
          req,
          user: req.user,
        })
        await req.payload.update({
          collection: 'agent-plans',
          data: { status: 'queued' },
          id: planID,
          overrideAccess: true,
          req,
        })
        const result = await runPlanLoop({ planID, req })
        return Response.json(result)
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
  {
    path: '/:id/cancel',
    method: 'post',
    handler: async (req) => {
      try {
        requireUser(req)
        const planID = String(req.routeParams?.id ?? '')
        await req.payload.findByID({
          collection: 'agent-plans',
          depth: 0,
          id: planID,
          overrideAccess: false,
          req,
          user: req.user,
        })
        const activeTasks = await req.payload.find({
          collection: 'agent-plan-tasks',
          depth: 0,
          limit: 50,
          overrideAccess: true,
          req,
          where: {
            and: [
              { plan: { equals: planID } },
              { status: { in: ['running', 'waiting'] } },
              { latestRun: { exists: true } },
            ],
          },
        })
        for (const task of activeTasks.docs) {
          const latestRun =
            typeof task.latestRun === 'string'
              ? task.latestRun
              : task.latestRun && typeof task.latestRun === 'object'
                ? String(task.latestRun.id)
                : null
          if (latestRun) {
            await cancelAgentRun({
              req: req as Parameters<typeof cancelAgentRun>[0]['req'],
              runID: latestRun,
            })
          }
        }
        await req.payload.update({
          collection: 'agent-plan-tasks',
          data: {
            errorCode: 'cancelled',
            errorMessage: 'Plan was cancelled.',
            finishedAt: new Date().toISOString(),
            status: 'cancelled',
          },
          overrideAccess: true,
          req,
          where: {
            and: [
              { plan: { equals: planID } },
              { status: { in: ['pending', 'ready', 'running', 'waiting', 'needs-approval'] } },
            ],
          },
        })
        const plan = await req.payload.update({
          collection: 'agent-plans',
          data: {
            finishedAt: new Date().toISOString(),
            status: 'cancelled',
          },
          id: planID,
          overrideAccess: true,
          req,
        })
        return Response.json({ plan })
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
  {
    path: '/:id/tasks',
    method: 'get',
    handler: async (req) => {
      try {
        requireUser(req)
        const planID = String(req.routeParams?.id ?? '')
        await req.payload.findByID({
          collection: 'agent-plans',
          depth: 0,
          id: planID,
          overrideAccess: false,
          req,
          user: req.user,
        })

        const tasks = await req.payload.find({
          collection: 'agent-plan-tasks',
          depth: 1,
          limit: 100,
          overrideAccess: true,
          req,
          sort: 'createdAt',
          where: { plan: { equals: planID } },
        })

        return Response.json(tasks)
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
]
