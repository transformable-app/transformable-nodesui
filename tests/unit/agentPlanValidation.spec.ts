import { describe, expect, it } from 'vitest'

import { validateAgentPlanInput } from '@/n8n/agents/plans/validatePlan'

const validPlan = {
  agent: 'structured-plan-echo',
  mode: 'dependency',
  objective: 'Ship the plan validator',
  tasks: [
    {
      id: 'draft',
      instructions: 'Draft the change',
      input: { apiKey: 'secret', count: 1 },
      title: 'Draft',
    },
    {
      dependsOn: ['draft'],
      id: 'review',
      instructions: 'Review the change',
      riskLevel: 'high',
      title: 'Review',
    },
  ],
  title: 'Validator plan',
}

describe('agent plan validation', () => {
  it('normalizes defaults and redacts sensitive values', () => {
    const result = validateAgentPlanInput(validPlan)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.plan.limits).toEqual({
      maxConcurrentTasks: 1,
      maxIterations: 4,
      maxTaskAttempts: 2,
      timeoutMS: 120000,
    })
    expect(result.plan.tasks[1].requiresApproval).toBe(true)
    expect(result.redactedPlan.tasks[0].input).toEqual({ apiKey: '[redacted]', count: 1 })
  })

  it('rejects duplicate task ids and unknown dependencies', () => {
    const result = validateAgentPlanInput({
      ...validPlan,
      tasks: [
        { id: 'same', instructions: 'A', title: 'A' },
        { dependsOn: ['missing'], id: 'same', instructions: 'B', title: 'B' },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors).toContain('Task id "same" is duplicated.')
    expect(result.errors).toContain('Task "same" depends on unknown task "missing".')
  })

  it('rejects dependency cycles', () => {
    const result = validateAgentPlanInput({
      ...validPlan,
      tasks: [
        { dependsOn: ['b'], id: 'a', instructions: 'A', title: 'A' },
        { dependsOn: ['a'], id: 'b', instructions: 'B', title: 'B' },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors).toContain('Task dependencies must be acyclic.')
  })

  it('enforces hard caps', () => {
    const result = validateAgentPlanInput({
      ...validPlan,
      limits: { maxConcurrentTasks: 99, maxIterations: 101, maxTaskAttempts: 6 },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors).toContain('limits.maxConcurrentTasks must be less than or equal to 4.')
    expect(result.errors).toContain('limits.maxIterations must be less than or equal to 100.')
    expect(result.errors).toContain('limits.maxTaskAttempts must be less than or equal to 5.')
  })

  it('requires and normalizes output binding for cms-draft tasks', () => {
    const missing = validateAgentPlanInput({
      ...validPlan,
      tasks: [
        {
          expectedOutput: { type: 'cms-draft' },
          id: 'draft',
          instructions: 'Draft CMS content',
          title: 'Draft',
        },
      ],
    })

    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.errors).toContain('tasks[0].outputBinding is required for cms-draft output.')
    }

    const valid = validateAgentPlanInput({
      ...validPlan,
      outputBinding: {
        allowedBlocks: ['content'],
        allowedFields: ['title', 'layout'],
        collection: 'pages',
        fieldMappings: [{ sourcePath: 'draft.title', targetPath: 'title' }],
        payloadSite: 'primary',
      },
      tasks: [
        {
          expectedOutput: { type: 'cms-draft' },
          id: 'draft',
          instructions: 'Draft CMS content',
          title: 'Draft',
        },
      ],
    })

    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.plan.tasks[0].outputBinding).toEqual(
        expect.objectContaining({
          allowedBlocks: ['content'],
          allowedFields: ['title', 'layout'],
          collection: 'pages',
          payloadSite: 'primary',
        }),
      )
    }
  })
})
