import { APIError, type Endpoint } from 'payload'

import { AgentHarnessError } from '@/n8n/agents/types'

import { createAgentPlan } from './createPlan'
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
