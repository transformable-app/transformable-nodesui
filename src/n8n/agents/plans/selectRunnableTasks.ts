type PlanMode = 'dependency' | 'manual' | 'sequential'
type TaskStatus =
  | 'blocked'
  | 'cancelled'
  | 'failed'
  | 'needs-approval'
  | 'pending'
  | 'ready'
  | 'running'
  | 'skipped'
  | 'succeeded'
  | 'waiting'

export type RunnablePlanTask = {
  attempts?: number | null
  dependsOn?: { taskID: string }[] | null
  id: string
  maxAttempts?: number | null
  status: TaskStatus
  taskID: string
}

const runnableStatuses = new Set<TaskStatus>(['pending', 'ready'])
const terminalStatuses = new Set<TaskStatus>([
  'blocked',
  'cancelled',
  'failed',
  'skipped',
  'succeeded',
])

const dependencyIDs = (task: RunnablePlanTask): string[] =>
  Array.isArray(task.dependsOn)
    ? task.dependsOn
        .map((dependency) => dependency.taskID)
        .filter((taskID): taskID is string => typeof taskID === 'string' && taskID.length > 0)
    : []

const attemptsRemaining = (task: RunnablePlanTask): boolean => {
  const attempts = typeof task.attempts === 'number' ? task.attempts : 0
  const maxAttempts = typeof task.maxAttempts === 'number' ? task.maxAttempts : 1
  return attempts < maxAttempts
}

const dependenciesSucceeded = (task: RunnablePlanTask, tasksByTaskID: Map<string, RunnablePlanTask>) =>
  dependencyIDs(task).every((dependencyID) => tasksByTaskID.get(dependencyID)?.status === 'succeeded')

export const selectRunnableTasks = ({
  maxConcurrentTasks,
  mode,
  tasks,
}: {
  maxConcurrentTasks: number
  mode: PlanMode
  tasks: RunnablePlanTask[]
}): RunnablePlanTask[] => {
  if (mode === 'manual') return []

  const activeCount = tasks.filter((task) => task.status === 'running' || task.status === 'waiting').length
  const openSlots = Math.max(0, maxConcurrentTasks - activeCount)
  if (openSlots === 0) return []

  const tasksByTaskID = new Map(tasks.map((task) => [task.taskID, task]))

  if (mode === 'sequential') {
    const nextTask = tasks.find((task) => !terminalStatuses.has(task.status))
    if (!nextTask || !runnableStatuses.has(nextTask.status) || !attemptsRemaining(nextTask)) return []
    return dependenciesSucceeded(nextTask, tasksByTaskID) ? [nextTask] : []
  }

  return tasks
    .filter(
      (task) =>
        runnableStatuses.has(task.status) &&
        attemptsRemaining(task) &&
        dependenciesSucceeded(task, tasksByTaskID),
    )
    .slice(0, openSlots)
}

export const hasBlockedDependencies = (
  task: RunnablePlanTask,
  tasksByTaskID: Map<string, RunnablePlanTask>,
) =>
  dependencyIDs(task).some((dependencyID) => {
    const dependency = tasksByTaskID.get(dependencyID)
    return dependency ? terminalStatuses.has(dependency.status) && dependency.status !== 'succeeded' : true
  })

export const isPlanTerminal = (tasks: RunnablePlanTask[]): boolean =>
  tasks.every((task) => terminalStatuses.has(task.status))
