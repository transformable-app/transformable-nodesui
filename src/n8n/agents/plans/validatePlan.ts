import { redactValue } from '@/n8n/agents/redact'

import {
  AGENT_PLAN_DEFAULT_APPROVAL_POLICY,
  AGENT_PLAN_LIMIT_CAPS,
  AGENT_PLAN_LIMIT_DEFAULTS,
  AGENT_PLAN_MODES,
  AGENT_PLAN_TASK_OUTPUT_TYPES,
  AGENT_PLAN_TASK_RISK_LEVELS,
  type AgentPlanInput,
  type AgentPlanMode,
  type AgentPlanTaskInput,
  type AgentPlanTaskOutputType,
  type AgentPlanTaskRiskLevel,
  type NormalizedAgentPlanInput,
} from './schema'

export type AgentPlanValidationResult =
  | { errors: string[]; ok: false }
  | { plan: NormalizedAgentPlanInput; redactedPlan: NormalizedAgentPlanInput; ok: true }

const TASK_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isMode = (value: unknown): value is AgentPlanMode =>
  AGENT_PLAN_MODES.includes(value as AgentPlanMode)

const isOutputType = (value: unknown): value is AgentPlanTaskOutputType =>
  AGENT_PLAN_TASK_OUTPUT_TYPES.includes(value as AgentPlanTaskOutputType)

const isRiskLevel = (value: unknown): value is AgentPlanTaskRiskLevel =>
  AGENT_PLAN_TASK_RISK_LEVELS.includes(value as AgentPlanTaskRiskLevel)

const cleanString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const normalizeIntegerLimit = ({
  cap,
  defaultValue,
  errors,
  label,
  value,
}: {
  cap: number
  defaultValue: number
  errors: string[]
  label: string
  value: unknown
}): number => {
  if (value === undefined || value === null) return defaultValue

  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1) {
    errors.push(`${label} must be a positive integer.`)
    return defaultValue
  }

  if (value > cap) {
    errors.push(`${label} must be less than or equal to ${cap}.`)
    return cap
  }

  return value
}

const normalizeTask = ({
  errors,
  rawTask,
  taskIndex,
}: {
  errors: string[]
  rawTask: unknown
  taskIndex: number
}): AgentPlanTaskInput | null => {
  if (!isPlainObject(rawTask)) {
    errors.push(`tasks[${taskIndex}] must be an object.`)
    return null
  }

  const id = cleanString(rawTask.id)
  const title = cleanString(rawTask.title)
  const instructions = cleanString(rawTask.instructions)

  if (!id) errors.push(`tasks[${taskIndex}].id is required.`)
  else if (!TASK_ID_PATTERN.test(id)) {
    errors.push(`tasks[${taskIndex}].id must be URL-safe and 1-80 characters.`)
  }

  if (!title) errors.push(`tasks[${taskIndex}].title is required.`)
  if (!instructions) errors.push(`tasks[${taskIndex}].instructions is required.`)

  const dependsOn = Array.isArray(rawTask.dependsOn)
    ? rawTask.dependsOn
        .map(cleanString)
        .filter((dependencyID): dependencyID is string => Boolean(dependencyID))
    : undefined

  if (rawTask.dependsOn !== undefined && !Array.isArray(rawTask.dependsOn)) {
    errors.push(`tasks[${taskIndex}].dependsOn must be an array.`)
  }

  const input = rawTask.input === undefined ? undefined : rawTask.input
  if (input !== undefined && !isPlainObject(input)) {
    errors.push(`tasks[${taskIndex}].input must be an object.`)
  } else if (input !== undefined && bytesOf(input) > AGENT_PLAN_LIMIT_CAPS.taskInputBytes) {
    errors.push(`tasks[${taskIndex}].input is too large.`)
  }

  let expectedOutput: AgentPlanTaskInput['expectedOutput']
  if (rawTask.expectedOutput !== undefined) {
    if (!isPlainObject(rawTask.expectedOutput)) {
      errors.push(`tasks[${taskIndex}].expectedOutput must be an object.`)
    } else if (!isOutputType(rawTask.expectedOutput.type)) {
      errors.push(`tasks[${taskIndex}].expectedOutput.type is invalid.`)
    } else {
      expectedOutput = {
        schema: isPlainObject(rawTask.expectedOutput.schema)
          ? rawTask.expectedOutput.schema
          : undefined,
        type: rawTask.expectedOutput.type,
      }
    }
  }

  const successCriteria = Array.isArray(rawTask.successCriteria)
    ? rawTask.successCriteria
        .map(cleanString)
        .filter((criterion): criterion is string => Boolean(criterion))
    : undefined
  if (rawTask.successCriteria !== undefined && !Array.isArray(rawTask.successCriteria)) {
    errors.push(`tasks[${taskIndex}].successCriteria must be an array.`)
  }

  const riskLevel =
    rawTask.riskLevel === undefined
      ? undefined
      : isRiskLevel(rawTask.riskLevel)
        ? rawTask.riskLevel
        : null
  if (riskLevel === null) errors.push(`tasks[${taskIndex}].riskLevel is invalid.`)

  if (!id || !title || !instructions) return null

  return {
    dependsOn,
    expectedOutput,
    id,
    input: isPlainObject(input) ? input : undefined,
    instructions,
    requiresApproval:
      typeof rawTask.requiresApproval === 'boolean' ? rawTask.requiresApproval : undefined,
    riskLevel: riskLevel ?? undefined,
    successCriteria,
    title,
  }
}

const addDependencyErrors = (tasks: AgentPlanTaskInput[], errors: string[]) => {
  const taskIDs = new Set(tasks.map((task) => task.id))
  const seen = new Set<string>()

  for (const task of tasks) {
    if (seen.has(task.id)) errors.push(`Task id "${task.id}" is duplicated.`)
    seen.add(task.id)

    for (const dependencyID of task.dependsOn ?? []) {
      if (!taskIDs.has(dependencyID)) {
        errors.push(`Task "${task.id}" depends on unknown task "${dependencyID}".`)
      }
      if (dependencyID === task.id) {
        errors.push(`Task "${task.id}" cannot depend on itself.`)
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const tasksByID = new Map(tasks.map((task) => [task.id, task]))

  const visit = (taskID: string): boolean => {
    if (visited.has(taskID)) return false
    if (visiting.has(taskID)) return true

    visiting.add(taskID)
    const task = tasksByID.get(taskID)
    for (const dependencyID of task?.dependsOn ?? []) {
      if (tasksByID.has(dependencyID) && visit(dependencyID)) return true
    }
    visiting.delete(taskID)
    visited.add(taskID)
    return false
  }

  for (const task of tasks) {
    if (visit(task.id)) {
      errors.push('Task dependencies must be acyclic.')
      return
    }
  }
}

export const validateAgentPlanInput = (input: unknown): AgentPlanValidationResult => {
  const errors: string[] = []

  if (!isPlainObject(input)) return { errors: ['Plan must be an object.'], ok: false }

  if (bytesOf(input) > AGENT_PLAN_LIMIT_CAPS.submittedPlanBytes) {
    errors.push('Plan JSON is too large.')
  }

  const title = cleanString(input.title)
  const objective = cleanString(input.objective)
  const agent = cleanString(input.agent)
  const mode = isMode(input.mode) ? input.mode : null

  if (!title) errors.push('title is required.')
  if (!objective) errors.push('objective is required.')
  if (!agent) errors.push('agent is required.')
  if (!mode) errors.push('mode is invalid.')

  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    errors.push('At least one task is required.')
  } else if (input.tasks.length > AGENT_PLAN_LIMIT_CAPS.tasksPerPlan) {
    errors.push(`No more than ${AGENT_PLAN_LIMIT_CAPS.tasksPerPlan} tasks are allowed.`)
  }

  const tasks = Array.isArray(input.tasks)
    ? input.tasks
        .slice(0, AGENT_PLAN_LIMIT_CAPS.tasksPerPlan)
        .map((task, index) => normalizeTask({ errors, rawTask: task, taskIndex: index }))
        .filter((task): task is AgentPlanTaskInput => Boolean(task))
    : []

  addDependencyErrors(tasks, errors)

  const limits = isPlainObject(input.limits) ? input.limits : {}
  if (input.limits !== undefined && !isPlainObject(input.limits)) errors.push('limits must be an object.')

  const maxIterationsDefault = Math.min(Math.max(tasks.length * 2, 1), AGENT_PLAN_LIMIT_CAPS.maxIterations)
  const normalizedLimits = {
    maxConcurrentTasks: normalizeIntegerLimit({
      cap: AGENT_PLAN_LIMIT_CAPS.maxConcurrentTasks,
      defaultValue: AGENT_PLAN_LIMIT_DEFAULTS.maxConcurrentTasks,
      errors,
      label: 'limits.maxConcurrentTasks',
      value: limits.maxConcurrentTasks,
    }),
    maxIterations: normalizeIntegerLimit({
      cap: AGENT_PLAN_LIMIT_CAPS.maxIterations,
      defaultValue: maxIterationsDefault,
      errors,
      label: 'limits.maxIterations',
      value: limits.maxIterations,
    }),
    maxTaskAttempts: normalizeIntegerLimit({
      cap: AGENT_PLAN_LIMIT_CAPS.maxTaskAttempts,
      defaultValue: AGENT_PLAN_LIMIT_DEFAULTS.maxTaskAttempts,
      errors,
      label: 'limits.maxTaskAttempts',
      value: limits.maxTaskAttempts,
    }),
    timeoutMS: normalizeIntegerLimit({
      cap: AGENT_PLAN_LIMIT_CAPS.timeoutMS,
      defaultValue: AGENT_PLAN_LIMIT_DEFAULTS.timeoutMS,
      errors,
      label: 'limits.timeoutMS',
      value: limits.timeoutMS,
    }),
  }

  const context = input.context === undefined ? undefined : input.context
  if (context !== undefined && !isPlainObject(context)) errors.push('context must be an object.')

  const approvalPolicyInput = isPlainObject(input.approvalPolicy) ? input.approvalPolicy : {}
  if (input.approvalPolicy !== undefined && !isPlainObject(input.approvalPolicy)) {
    errors.push('approvalPolicy must be an object.')
  }

  if (errors.length > 0 || !title || !objective || !agent || !mode) {
    return { errors, ok: false }
  }

  const approvalPolicy = {
    ...AGENT_PLAN_DEFAULT_APPROVAL_POLICY,
    ...Object.fromEntries(
      Object.entries(approvalPolicyInput).filter(([, value]) => typeof value === 'boolean'),
    ),
  }

  const normalizedPlan: NormalizedAgentPlanInput = {
    agent,
    approvalPolicy,
    context: isPlainObject(context) ? context : undefined,
    limits: normalizedLimits,
    mode,
    objective,
    tasks: tasks.map((task) => ({
      ...task,
      dependsOn: task.dependsOn ?? [],
      maxAttempts: normalizedLimits.maxTaskAttempts,
      requiresApproval:
        task.requiresApproval === true ||
        (approvalPolicy.requireOnRisk && task.riskLevel === 'high') ||
        (approvalPolicy.requireBeforeWrite && task.expectedOutput?.type === 'cms-draft'),
      riskLevel: task.riskLevel ?? 'low',
    })),
    title,
  }

  return {
    ok: true,
    plan: normalizedPlan,
    redactedPlan: redactValue(normalizedPlan) as NormalizedAgentPlanInput,
  }
}
