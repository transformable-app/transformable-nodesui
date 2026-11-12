import { describe, expect, it, vi } from 'vitest'

import { invokeN8nAgent } from '@/n8n/agents/adapters'
import { failPlanTask, finalizePlanTask } from '@/n8n/agents/plans/finalizeTask'
import { runPlanLoop } from '@/n8n/agents/plans/runPlanLoop'

vi.mock('@/n8n/agents/adapters', () => ({ invokeN8nAgent: vi.fn() }))
vi.mock('@/n8n/agents/invocationSecret', () => ({ getAgentInvocationSecret: vi.fn() }))
vi.mock('@/n8n/agents/plans/finalizeTask', () => ({
  failPlanTask: vi.fn(),
  finalizePlanTask: vi.fn(),
  refreshPlanStatus: vi.fn(),
}))

const binding = { allowedBlocks: ['content'], collection: 'pages', operation: 'create', payloadSite: 'remote' }

const setup = (connected: boolean) => {
  vi.clearAllMocks()
  const task = {
    expectedOutput: { type: 'cms-draft' },
    id: 'task-1',
    instructions: 'Add a content block',
    status: 'pending',
    taskID: 'draft',
  }
  const plan = {
    agent: 'agent-1',
    id: 'plan-1',
    mode: 'dependency',
    objective: 'Draft a landing page',
    session: 'session-1',
  }
  const agent = {
    enabled: true,
    endpointPath: '/webhook/draft',
    id: 'agent-1',
    outputBinding: binding,
    server: { baseURL: 'https://n8n.example.com' },
  }
  const site = {
    allowedCollections: ['pages'],
    companionPluginStatus: connected ? 'connected' : 'failed',
    enabled: true,
    schemaProfile: {
      collections: [{
        blocks: [{ slug: 'content', fields: [{ name: 'body' }] }, { slug: 'hero' }],
        draftSupport: true,
        fields: [{ name: 'layout', type: 'blocks' }],
        slug: 'pages',
      }],
    },
    schemaProfileStatus: 'synced',
    writeBackEnabled: true,
  }
  const update = vi.fn(async ({ id }: { id: string }) => ({ id }))
  const req = {
    payload: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      find: vi.fn(async () => ({ docs: [task] })),
      findByID: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'agent-plans') return plan
        if (collection === 'agents') return agent
        return site
      }),
      update,
    },
    user: { id: 'user-1', roleNames: ['Admin'] },
  }
  return { req, update }
}

describe('CMS draft plan dispatch', () => {
  it('sends the saved target, output contract and allowed block schema to the workflow', async () => {
    const { req, update } = setup(true)
    const response = { content: 'Draft generated', status: 'succeeded' } as const
    vi.mocked(invokeN8nAgent).mockResolvedValue(response)

    await runPlanLoop({ planID: 'plan-1', req: req as never })

    expect(req.payload.findByID).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'agents',
      depth: 2,
      id: 'agent-1',
      overrideAccess: false,
      user: req.user,
    }))
    expect(invokeN8nAgent).toHaveBeenCalledWith(expect.objectContaining({
      agent: expect.objectContaining({ endpointPath: '/webhook/draft' }),
      server: { baseURL: 'https://n8n.example.com' },
    }))
    const invocation = vi.mocked(invokeN8nAgent).mock.calls[0]?.[0].invocation
    expect(invocation?.input.text).toContain('"payloadSite": "remote"')
    expect(invocation?.input.text).toContain('blockType')
    expect(invocation?.input.text).toContain('companion plugin')
    expect(invocation?.input.data).toMatchObject({
      outputBinding: binding,
      remoteCMSSchema: { blocks: [{ slug: 'content', fields: [{ name: 'body' }] }] },
    })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'agent-plan-tasks',
      data: { outputBinding: expect.objectContaining(binding) },
      id: 'task-1',
    }))
    expect(finalizePlanTask).toHaveBeenCalledWith(expect.objectContaining({ response, taskID: 'task-1' }))
  })

  it('reports a disconnected companion plugin before invoking the workflow', async () => {
    const { req } = setup(false)
    await runPlanLoop({ planID: 'plan-1', req: req as never })

    expect(invokeN8nAgent).not.toHaveBeenCalled()
    expect(failPlanTask).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'input-validation',
      errorMessage: expect.stringContaining('companion plugin'),
    }))
  })
})
