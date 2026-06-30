import { describe, expect, it } from 'vitest'

import { selectRunnableTasks } from '@/n8n/agents/plans/selectRunnableTasks'

const task = (overrides: Partial<Parameters<typeof selectRunnableTasks>[0]['tasks'][number]>) => ({
  attempts: 0,
  dependsOn: [],
  id: overrides.taskID ?? 'task',
  maxAttempts: 2,
  status: 'pending' as const,
  taskID: overrides.taskID ?? 'task',
  ...overrides,
})

describe('agent plan runnable task selection', () => {
  it('runs only the first incomplete task in sequential mode', () => {
    const runnable = selectRunnableTasks({
      maxConcurrentTasks: 4,
      mode: 'sequential',
      tasks: [
        task({ status: 'succeeded', taskID: 'a' }),
        task({ taskID: 'b' }),
        task({ taskID: 'c' }),
      ],
    })

    expect(runnable.map((item) => item.taskID)).toEqual(['b'])
  })

  it('runs dependency-ready tasks up to concurrency', () => {
    const runnable = selectRunnableTasks({
      maxConcurrentTasks: 2,
      mode: 'dependency',
      tasks: [
        task({ status: 'succeeded', taskID: 'a' }),
        task({ dependsOn: [{ taskID: 'a' }], taskID: 'b' }),
        task({ dependsOn: [{ taskID: 'a' }], taskID: 'c' }),
        task({ dependsOn: [{ taskID: 'b' }], taskID: 'd' }),
      ],
    })

    expect(runnable.map((item) => item.taskID)).toEqual(['b', 'c'])
  })

  it('does not auto-dispatch manual plans', () => {
    expect(
      selectRunnableTasks({
        maxConcurrentTasks: 1,
        mode: 'manual',
        tasks: [task({ taskID: 'a' })],
      }),
    ).toEqual([])
  })

  it('does not retry tasks that exhausted attempts', () => {
    expect(
      selectRunnableTasks({
        maxConcurrentTasks: 1,
        mode: 'dependency',
        tasks: [task({ attempts: 2, maxAttempts: 2, taskID: 'a' })],
      }),
    ).toEqual([])
  })
})
