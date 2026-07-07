import { APIError, type Endpoint } from 'payload'

import { cancelAgentRun } from '@/n8n/agents/invokeAgent'
import { AgentHarnessError } from '@/n8n/agents/types'
import { publishDraftDocument } from '@/payloadSites/client'

import { createAgentPlan } from './createPlan'
import { refreshPlanStatus } from './finalizeTask'
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

const getRelationshipID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }

  return null
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
    path: '/:id/tasks/:taskID/approve',
    method: 'post',
    handler: async (req) => {
      try {
        requireUser(req)
        const planID = String(req.routeParams?.id ?? '')
        const taskParam = String(req.routeParams?.taskID ?? '')
        if (!planID || !taskParam) {
          throw new AgentHarnessError('input-validation', 'Plan and task are required.', 400)
        }

        await req.payload.findByID({
          collection: 'agent-plans',
          depth: 0,
          id: planID,
          overrideAccess: false,
          req,
          user: req.user,
        })

        const byID = await req.payload
          .findByID({
            collection: 'agent-plan-tasks',
            depth: 0,
            id: taskParam,
            overrideAccess: true,
            req,
          })
          .catch(() => null)

        const task =
          byID && getRelationshipID(byID.plan) === planID
            ? byID
            : (
                await req.payload.find({
                  collection: 'agent-plan-tasks',
                  depth: 0,
                  limit: 1,
                  overrideAccess: true,
                  req,
                  where: {
                    and: [{ plan: { equals: planID } }, { taskID: { equals: taskParam } }],
                  },
                })
              ).docs[0]

        if (!task) throw new AgentHarnessError('not-found', 'Plan task not found.', 404)
        if (task.status !== 'needs-approval') {
          throw new AgentHarnessError('input-validation', 'Plan task is not waiting for approval.', 400)
        }

        const latestRunID = getRelationshipID(task.latestRun)
        const latestRun = latestRunID
          ? await req.payload.findByID({
              collection: 'agent-runs',
              depth: 0,
              id: latestRunID,
              overrideAccess: true,
              req,
            })
          : null
        const remoteDraft =
          latestRun?.remoteDraft && typeof latestRun.remoteDraft === 'object'
            ? latestRun.remoteDraft
            : null
        const hasCreatedRemoteDraft = remoteDraft?.status === 'created'

        if (hasCreatedRemoteDraft) {
          if (!latestRunID) {
            throw new AgentHarnessError('input-validation', 'Remote draft is missing its agent run.', 400)
          }
          const payloadSiteID = getRelationshipID(remoteDraft.payloadSite)
          if (!payloadSiteID) {
            throw new AgentHarnessError('input-validation', 'Remote draft is missing its target Payload site.', 400)
          }
          if (typeof remoteDraft.collection !== 'string' || !remoteDraft.collection) {
            throw new AgentHarnessError('input-validation', 'Remote draft is missing its target collection.', 400)
          }
          if (typeof remoteDraft.documentID !== 'string' || !remoteDraft.documentID) {
            throw new AgentHarnessError('input-validation', 'Remote draft is missing its target document.', 400)
          }

          const payloadSite = await req.payload.findByID({
            collection: 'payload-sites',
            depth: 0,
            id: payloadSiteID,
            overrideAccess: true,
            req,
          })
          const publishResponse = await publishDraftDocument({
            collection: remoteDraft.collection,
            id: remoteDraft.documentID,
            site: payloadSite,
          })
          await req.payload.update({
            collection: 'agent-runs',
            data: {
              remoteDraft: {
                ...remoteDraft,
                lastSyncedAt: new Date().toISOString(),
                response: publishResponse,
                status: 'published',
              },
            },
            id: latestRunID,
            overrideAccess: true,
            req,
          })
          const updatedTask = await req.payload.update({
            collection: 'agent-plan-tasks',
            data: {
              finishedAt: new Date().toISOString(),
              status: 'succeeded',
            },
            id: task.id,
            overrideAccess: true,
            req,
          })
          const plan = await refreshPlanStatus({ planID, req })
          return Response.json({ ok: true, plan, task: updatedTask })
        }

        const updatedTask = await req.payload.update({
          collection: 'agent-plan-tasks',
          data: {
            status: 'pending',
          },
          id: task.id,
          overrideAccess: true,
          req,
        })

        const result = await runPlanLoop({ planID, req })
        return Response.json({ ok: true, result, task: updatedTask })
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

        const latestRunIDs = tasks.docs
          .map((task) => getRelationshipID(task.latestRun))
          .filter((id): id is string => Boolean(id))
        const approvals =
          latestRunIDs.length > 0
            ? await req.payload.find({
                collection: 'agent-approvals',
                depth: 0,
                limit: 100,
                overrideAccess: false,
                req,
                user: req.user,
                where: {
                  and: [{ run: { in: latestRunIDs } }, { status: { equals: 'pending' } }],
                },
              })
            : { docs: [] }

        const approvalsByRun = new Map(
          approvals.docs
            .map((approval) => {
              const runID = getRelationshipID(approval.run)
              return runID ? [runID, approval] : null
            })
            .filter((entry): entry is [string, (typeof approvals.docs)[number]] => Boolean(entry)),
        )

        return Response.json({
          ...tasks,
          docs: tasks.docs.map((task) => {
            const latestRunID = getRelationshipID(task.latestRun)
            const approval = latestRunID ? approvalsByRun.get(latestRunID) : undefined
            return {
              ...task,
              pendingApproval: approval
                ? {
                    expiresAt: approval.expiresAt,
                    id: approval.id,
                    prompt: approval.prompt,
                    title: approval.title,
                  }
                : undefined,
            }
          }),
        })
      } catch (error) {
        return handlePlanError(error)
      }
    },
  },
]
