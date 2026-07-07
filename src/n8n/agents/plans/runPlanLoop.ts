import { randomUUID } from 'crypto'
import type { PayloadRequest } from 'payload'

import type { AgentPlan, AgentPlanTask } from '@/payload-types'
import { invokeN8nAgent } from '@/n8n/agents/adapters'
import { redactValue, toPreview } from '@/n8n/agents/redact'
import { userCanInvokeAgent } from '@/n8n/agents/resolveAgent'
import { AgentHarnessError, type AgentRequest } from '@/n8n/agents/types'
import { assertSameServerURL } from '@/n8n/agents/buildEndpoint'

import { failPlanTask, finalizePlanTask, refreshPlanStatus } from './finalizeTask'
import { selectRunnableTasks } from './selectRunnableTasks'

const asPayloadJSON = (value: unknown) =>
  value as string | number | boolean | unknown[] | { [k: string]: unknown } | null | undefined

const getRelationshipID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }

  return null
}

const getSubmittedTaskInput = (plan: AgentPlan, taskID: string): Record<string, unknown> => {
  const submittedInput = plan.submittedInput
  if (!submittedInput || typeof submittedInput !== 'object' || Array.isArray(submittedInput)) return {}

  const tasks = (submittedInput as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return {}

  const task = tasks.find(
    (candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      (candidate as { id?: unknown }).id === taskID,
  )

  const input = task && typeof task === 'object' ? (task as { input?: unknown }).input : undefined
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

const getDependencyOutputs = (task: AgentPlanTask, tasks: AgentPlanTask[]) => {
  const dependencies = Array.isArray(task.dependsOn) ? task.dependsOn : []

  return dependencies
    .map((dependency) => {
      const dependencyTask = tasks.find((candidate) => candidate.taskID === dependency.taskID)
      if (!dependencyTask) return null

      return {
        outputPreview: dependencyTask.outputPreview,
        outputSummary: dependencyTask.outputSummary,
        taskID: dependencyTask.taskID,
        title: dependencyTask.title,
      }
    })
    .filter((dependency): dependency is NonNullable<typeof dependency> => Boolean(dependency))
}

const createPlanApprovalFromResponse = async ({
  agent,
  req,
  response,
  runID,
  server,
  sessionID,
}: {
  agent: Record<string, unknown>
  req: AgentRequest
  response: { approval?: { expiresAt?: string; prompt?: string; resumeURL: string; title?: string } }
  runID: string
  server: Record<string, unknown>
  sessionID: string
}) => {
  if (!response.approval?.resumeURL) return

  const agentID = getRelationshipID(agent)
  if (!agentID) return

  const existingApproval = await req.payload.find({
    collection: 'agent-approvals',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      and: [{ run: { equals: runID } }, { status: { in: ['pending', 'consuming'] } }],
    },
  })
  if (existingApproval.docs[0]) return

  const resumeURL = assertSameServerURL({
    baseURL: server.baseURL,
    targetURL: response.approval.resumeURL,
  }).toString()

  await req.payload.create({
    collection: 'agent-approvals',
    data: {
      agent: agentID,
      expiresAt: response.approval.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      prompt: response.approval.prompt || 'This plan task is waiting for approval.',
      resumeURL,
      run: runID,
      session: sessionID,
      status: 'pending',
      title: response.approval.title || 'Plan task approval',
      user: req.user.id,
    },
    overrideAccess: true,
    req,
  })
}

const ensurePlanSession = async ({
  agentID,
  plan,
  req,
}: {
  agentID: string
  plan: AgentPlan
  req: AgentRequest
}) => {
  const existingSessionID = getRelationshipID(plan.session)
  if (existingSessionID) return existingSessionID

  const session = await req.payload.create({
    collection: 'agent-sessions',
    data: {
      agent: agentID,
      externalSessionID: randomUUID(),
      lastRunAt: new Date().toISOString(),
      metadata: asPayloadJSON({ planID: plan.id }),
      status: 'active',
      title: plan.title,
      user: req.user.id,
    },
    overrideAccess: true,
    req,
  })

  await req.payload.update({
    collection: 'agent-plans',
    data: { session: String(session.id) },
    id: plan.id,
    overrideAccess: true,
    req,
  })

  return String(session.id)
}

const dispatchPlanTask = async ({
  agent,
  iteration,
  plan,
  req,
  server,
  sessionID,
  task,
  tasks,
}: {
  agent: Record<string, unknown>
  iteration: number
  plan: AgentPlan
  req: AgentRequest
  server: Record<string, unknown>
  sessionID: string
  task: AgentPlanTask
  tasks: AgentPlanTask[]
}) => {
  const requestID = randomUUID()
  const startedAt = new Date()
  const attempts = (task.attempts ?? 0) + 1
  const input = getSubmittedTaskInput(plan, task.taskID)
  const dependencyOutputs = getDependencyOutputs(task, tasks)
  const invocationData = {
    dependencyOutputs,
    expectedOutput: task.expectedOutput,
    input,
    instructions: task.instructions,
    objective: plan.objective,
    outputBinding: task.outputBinding,
    planID: plan.id,
    taskID: task.taskID,
    title: task.title,
  }

  const run = await req.payload.create({
    collection: 'agent-runs',
    data: {
      agent: String(agent.id),
      inputPreview: toPreview(invocationData, 8000),
      iteration,
      plan: plan.id,
      planTask: task.id,
      requestID,
      session: sessionID,
      startedAt: startedAt.toISOString(),
      status: 'running',
      user: req.user.id,
    },
    overrideAccess: true,
    req,
  })

  await req.payload.update({
    collection: 'agent-plan-tasks',
    data: {
      attempts,
      latestRun: String(run.id),
      runs: [...(Array.isArray(task.runs) ? task.runs.map(String) : []), String(run.id)],
      startedAt: task.startedAt ?? startedAt.toISOString(),
      status: 'running',
    },
    id: task.id,
    overrideAccess: true,
    req,
  })

  try {
    const response = await invokeN8nAgent({
      agent,
      invocation: {
        actor: {
          id: req.user.id,
          roles: Array.isArray(req.user.roleNames)
            ? req.user.roleNames.filter((role): role is string => typeof role === 'string')
            : [],
        },
        context:
          plan.sharedContext && typeof plan.sharedContext === 'object' && !Array.isArray(plan.sharedContext)
            ? (plan.sharedContext as Record<string, unknown>)
            : undefined,
        input: {
          data: invocationData,
          text: task.instructions,
        },
        requestID,
        sessionID,
      },
      server,
    })
    const finishedAt = new Date()
    const runStatus =
      response.status === 'waiting'
        ? 'waiting'
        : response.status === 'failed'
          ? 'failed'
          : 'succeeded'

    const updatedRun = await req.payload.update({
      collection: 'agent-runs',
      data: {
        durationMS: finishedAt.getTime() - startedAt.getTime(),
        finishedAt: runStatus === 'waiting' ? undefined : finishedAt.toISOString(),
        firstByteMS: finishedAt.getTime() - startedAt.getTime(),
        n8nExecutionID: response.n8nExecutionID,
        outputPreview: toPreview(response.data ?? response.content, 8000),
        status: runStatus,
        usage: asPayloadJSON(response.usage ? redactValue(response.usage) : undefined),
      },
      id: run.id,
      overrideAccess: true,
      req,
    })

    if (response.status === 'waiting') {
      await createPlanApprovalFromResponse({
        agent,
        req,
        response,
        runID: String(updatedRun.id),
        server,
        sessionID,
      })
    }

    await finalizePlanTask({
      req,
      response,
      runID: String(updatedRun.id),
      taskID: task.id,
    })
  } catch (error) {
    const finishedAt = new Date()
    const harnessError =
      error instanceof AgentHarnessError
        ? error
        : new AgentHarnessError('workflow-error', 'The agent request failed.', 502)

    await req.payload.update({
      collection: 'agent-runs',
      data: {
        durationMS: finishedAt.getTime() - startedAt.getTime(),
        errorCode: harnessError.code,
        errorMessage: harnessError.message,
        finishedAt: finishedAt.toISOString(),
        status: harnessError.code === 'upstream-timeout' ? 'timed-out' : 'failed',
      },
      id: run.id,
      overrideAccess: true,
      req,
    })

    await failPlanTask({
      errorCode: harnessError.code,
      errorMessage: harnessError.message,
      req,
      runID: String(run.id),
      taskID: task.id,
    })
  }
}

export const runPlanLoop = async ({
  planID,
  req,
}: {
  planID: string
  req: PayloadRequest
}) => {
  if (!req.user) throw new AgentHarnessError('auth', 'Unauthorized.', 401)
  const agentReq = req as AgentRequest

  const plan = await req.payload.findByID({
    collection: 'agent-plans',
    depth: 2,
    id: planID,
    overrideAccess: false,
    req,
    user: req.user,
  })

  if (!plan) throw new AgentHarnessError('not-found', 'Plan not found.', 404)
  if (['cancelled', 'failed', 'paused', 'succeeded'].includes(plan.status)) {
    return { dispatched: 0, plan }
  }

  const agent = plan.agent
  if (
    !agent ||
    typeof agent !== 'object' ||
    !userCanInvokeAgent(agent as unknown as Record<string, unknown>, agentReq.user)
  ) {
    throw new AgentHarnessError('not-found', 'Agent not found or not available.', 404)
  }

  const server = (agent as { server?: unknown }).server
  if (!server || typeof server !== 'object') {
    throw new AgentHarnessError('input-validation', 'Agent server is not configured.', 500)
  }

  const maxConcurrentTasks = plan.limits?.maxConcurrentTasks ?? 1
  const maxIterations = plan.limits?.maxIterations ?? 1

  const sessionID = await ensurePlanSession({
    agentID: String((agent as { id: unknown }).id),
    plan,
    req: agentReq,
  })

  await req.payload.update({
    collection: 'agent-plans',
    data: {
      lastRunAt: new Date().toISOString(),
      startedAt: plan.startedAt ?? new Date().toISOString(),
      status: 'running',
    },
    id: plan.id,
    overrideAccess: true,
    req,
  })

  let dispatched = 0
  let iterations = 0

  while (iterations < maxIterations) {
    const tasksResult = await req.payload.find({
      collection: 'agent-plan-tasks',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      req,
      sort: 'createdAt',
      where: { plan: { equals: plan.id } },
    })
    const tasks = tasksResult.docs as AgentPlanTask[]
    const runnableTasks = selectRunnableTasks({
      maxConcurrentTasks,
      mode: plan.mode,
      tasks,
    }) as AgentPlanTask[]

    if (runnableTasks.length === 0) break

    for (const task of runnableTasks) {
      dispatched += 1
      iterations += 1
      await dispatchPlanTask({
        agent: agent as unknown as Record<string, unknown>,
        iteration: task.attempts ?? 0,
        plan,
        req: agentReq,
        server: server as Record<string, unknown>,
        sessionID,
        task,
        tasks,
      })

      if (iterations >= maxIterations) break
    }
  }

  await refreshPlanStatus({ planID: plan.id, req })
  return { dispatched, planID: plan.id }
}
