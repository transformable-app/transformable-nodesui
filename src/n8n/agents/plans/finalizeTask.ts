import type { PayloadRequest } from 'payload'

import { redactValue, toPreview } from '@/n8n/agents/redact'
import type { AgentInvokeResult } from '@/n8n/agents/types'

import { isPlanTerminal, type RunnablePlanTask } from './selectRunnableTasks'

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

const getTaskStatusForResponse = (response: AgentInvokeResult) => {
  if (response.status === 'waiting') return 'waiting'
  if (response.status === 'needs-approval') return 'needs-approval'
  if (response.status === 'failed') return 'failed'
  return 'succeeded'
}

const getPlanStatusFromTasks = (tasks: RunnablePlanTask[]) => {
  if (tasks.some((task) => task.status === 'running')) return 'running'
  if (tasks.some((task) => task.status === 'waiting' || task.status === 'needs-approval')) return 'waiting'
  if (tasks.some((task) => task.status === 'failed' || task.status === 'blocked')) return 'failed'
  if (tasks.some((task) => task.status === 'cancelled')) return 'cancelled'
  return isPlanTerminal(tasks) ? 'succeeded' : 'queued'
}

export const refreshPlanStatus = async ({
  planID,
  req,
}: {
  planID: string
  req: PayloadRequest
}) => {
  const tasksResult = await req.payload.find({
    collection: 'agent-plan-tasks',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    req,
    where: { plan: { equals: planID } },
  })
  const tasks = tasksResult.docs as RunnablePlanTask[]
  const status = getPlanStatusFromTasks(tasks)
  const finishedAt = ['succeeded', 'failed', 'cancelled'].includes(status)
    ? new Date().toISOString()
    : undefined

  return req.payload.update({
    collection: 'agent-plans',
    data: {
      finishedAt,
      status,
    },
    id: planID,
    overrideAccess: true,
    req,
  })
}

export const finalizePlanTask = async ({
  req,
  response,
  runID,
  taskID,
}: {
  req: PayloadRequest
  response: AgentInvokeResult
  runID: string
  taskID: string
}) => {
  const finishedAt = new Date().toISOString()
  const status = getTaskStatusForResponse(response)
  const outputValue = response.data ?? response.content
  const task = await req.payload.update({
    collection: 'agent-plan-tasks',
    data: {
      errorCode: response.status === 'failed' ? 'workflow-error' : undefined,
      errorMessage: response.status === 'failed' ? response.content : undefined,
      finishedAt: status === 'succeeded' || status === 'failed' ? finishedAt : undefined,
      latestRun: runID,
      outputPreview: toPreview(outputValue, 8000),
      outputSummary: asPayloadJSON(redactValue(response.data ?? { content: response.content })),
      status,
    },
    id: taskID,
    overrideAccess: true,
    req,
  })

  const planID = getRelationshipID(task.plan)
  if (planID) await refreshPlanStatus({ planID, req })

  return task
}

export const failPlanTask = async ({
  errorCode,
  errorMessage,
  req,
  runID,
  taskID,
}: {
  errorCode: string
  errorMessage: string
  req: PayloadRequest
  runID?: string
  taskID: string
}) => {
  const task = await req.payload.update({
    collection: 'agent-plan-tasks',
    data: {
      errorCode,
      errorMessage,
      finishedAt: new Date().toISOString(),
      latestRun: runID,
      status: 'failed',
    },
    id: taskID,
    overrideAccess: true,
    req,
  })

  const planID = getRelationshipID(task.plan)
  if (planID) await refreshPlanStatus({ planID, req })

  return task
}

export const finalizePlanTaskFromRun = async ({
  req,
  response,
  run,
}: {
  req: Pick<PayloadRequest, 'payload'>
  response: AgentInvokeResult
  run: {
    id: string
    plan?: unknown
    planTask?: unknown
  }
}) => {
  const taskID = getRelationshipID(run.planTask)
  if (!taskID) return null

  const task = await req.payload.update({
    collection: 'agent-plan-tasks',
    data: {
      errorCode: response.status === 'failed' ? 'workflow-error' : undefined,
      errorMessage: response.status === 'failed' ? response.content : undefined,
      finishedAt:
        response.status === 'succeeded' || response.status === 'failed'
          ? new Date().toISOString()
          : undefined,
      latestRun: run.id,
      outputPreview: toPreview(response.data ?? response.content, 8000),
      outputSummary: asPayloadJSON(redactValue(response.data ?? { content: response.content })),
      status: getTaskStatusForResponse(response),
    },
    id: taskID,
    overrideAccess: true,
  })

  const planID = getRelationshipID(run.plan) ?? getRelationshipID(task.plan)
  if (planID) await refreshPlanStatus({ planID, req: req as PayloadRequest })

  return task
}
