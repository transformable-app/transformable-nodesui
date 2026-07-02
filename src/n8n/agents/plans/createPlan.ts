import type { PayloadRequest } from 'payload'

import { AgentHarnessError } from '@/n8n/agents/types'
import { toPreview } from '@/n8n/agents/redact'

import { runPlanLoop } from './runPlanLoop'
import { validateAgentPlanInput } from './validatePlan'

type CreateAgentPlanArgs = {
  input: unknown
  req: PayloadRequest
  start?: boolean
}

const asPayloadJSON = (value: unknown) =>
  value as string | number | boolean | unknown[] | { [k: string]: unknown } | null | undefined

const getAgentID = async ({ agent, req }: { agent: string; req: PayloadRequest }) => {
  const byID = await req.payload
    .findByID({
      collection: 'agents',
      depth: 0,
      id: agent,
      overrideAccess: false,
      req,
      user: req.user,
    })
    .catch(() => null)

  if (byID) return String(byID.id)

  const bySlug = await req.payload.find({
    collection: 'agents',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    user: req.user,
    where: { slug: { equals: agent } },
  })

  const found = bySlug.docs[0]
  if (!found) {
    throw new AgentHarnessError('not-found', 'Agent not found or not available.', 404)
  }

  return String(found.id)
}

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agent-plan'

export const createAgentPlan = async ({ input, req, start = false }: CreateAgentPlanArgs) => {
  if (!req.user) throw new AgentHarnessError('auth', 'Unauthorized.', 401)

  const validation = validateAgentPlanInput(input)
  if (!validation.ok) {
    throw new AgentHarnessError('input-validation', validation.errors.join(' '), 400)
  }

  const agentID = await getAgentID({ agent: validation.plan.agent, req })
  const now = new Date().toISOString()
  const plan = await req.payload.create({
    collection: 'agent-plans',
    data: {
      agent: agentID,
      approvalPolicy: validation.plan.approvalPolicy,
      createdBy: req.user.id,
      limits: validation.plan.limits,
      mode: validation.plan.mode,
      objective: validation.plan.objective,
      outputBinding: asPayloadJSON(validation.plan.outputBinding),
      sharedContext: asPayloadJSON(validation.redactedPlan.context ?? {}),
      slug: `${toSlug(validation.plan.title)}-${Date.now().toString(36)}`,
      startedAt: start ? now : undefined,
      status: start ? 'queued' : 'draft',
      submittedInput: asPayloadJSON({
        ...validation.redactedPlan,
        agent: agentID,
      }),
      title: validation.plan.title,
    },
    overrideAccess: true,
    req,
  })

  const tasks = []
  for (const task of validation.plan.tasks) {
    tasks.push(
      await req.payload.create({
        collection: 'agent-plan-tasks',
        data: {
          dependsOn: task.dependsOn.map((dependencyID) => ({ taskID: dependencyID })),
          expectedOutput: asPayloadJSON(task.expectedOutput),
          outputBinding: asPayloadJSON(task.outputBinding),
          createdBy: req.user.id,
          attempts: 0,
          inputPreview: toPreview(task.input ?? {}, 8000),
          instructions: task.instructions,
          maxAttempts: task.maxAttempts,
          plan: String(plan.id),
          requiresApproval: task.requiresApproval,
          riskLevel: task.riskLevel,
          status: start && task.requiresApproval ? 'needs-approval' : 'pending',
          successCriteria: task.successCriteria?.map((criterion) => ({ criterion })),
          taskID: task.id,
          title: task.title,
        },
        overrideAccess: true,
        req,
      }),
    )
  }

  if (start) {
    await runPlanLoop({ planID: String(plan.id), req })
  }

  return { plan, tasks, validation: { plan: validation.redactedPlan } }
}
