import { beforeEach, describe, expect, it, vi } from 'vitest'

import { agentPlanCollectionEndpoints } from '@/n8n/agents/plans/endpoints'
import { refreshPlanStatus } from '@/n8n/agents/plans/finalizeTask'
import { runPlanLoop } from '@/n8n/agents/plans/runPlanLoop'
import { publishDraftDocument } from '@/payloadSites/client'

vi.mock('@/n8n/agents/plans/finalizeTask', async () => {
  const actual = await vi.importActual<typeof import('@/n8n/agents/plans/finalizeTask')>(
    '@/n8n/agents/plans/finalizeTask',
  )
  return {
    ...actual,
    refreshPlanStatus: vi.fn(),
  }
})

vi.mock('@/n8n/agents/plans/runPlanLoop', () => ({
  runPlanLoop: vi.fn(),
}))

vi.mock('@/payloadSites/client', () => ({
  publishDraftDocument: vi.fn(),
}))

const mockedRefreshPlanStatus = vi.mocked(refreshPlanStatus)
const mockedRunPlanLoop = vi.mocked(runPlanLoop)
const mockedPublishDraftDocument = vi.mocked(publishDraftDocument)

const getEndpoint = (path: string) => {
  const endpoint = agentPlanCollectionEndpoints.find((candidate) => candidate.path === path)
  if (!endpoint) throw new Error(`Endpoint ${path} not found.`)
  return endpoint
}

describe('agent plan endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRefreshPlanStatus.mockResolvedValue({ id: 'plan-1', status: 'succeeded' } as never)
    mockedRunPlanLoop.mockResolvedValue({ dispatched: 1, planID: 'plan-1' } as never)
    mockedPublishDraftDocument.mockResolvedValue({ id: 'remote-1', _status: 'published' })
  })

  it('approves a plan task and resumes the plan loop', async () => {
    const req = {
      payload: {
        find: vi.fn(async () => ({ docs: [] })),
        findByID: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === 'agent-plans') return { id: 'plan-1', status: 'waiting' }
          if (collection === 'agent-plan-tasks') {
            return {
              id: 'task-doc-1',
              plan: 'plan-1',
              status: 'needs-approval',
              taskID: 'draft',
            }
          }
          throw new Error('not found')
        }),
        update: vi.fn(async (args: Record<string, unknown>) => ({
          id: args.id,
          ...(args.data as object),
        })),
      },
      routeParams: { id: 'plan-1', taskID: 'draft' },
      user: { id: 'user-1' },
    }

    const response = await getEndpoint('/:id/tasks/:taskID/approve').handler(req as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-plan-tasks',
        data: { status: 'pending' },
        id: 'task-doc-1',
      }),
    )
    expect(mockedRunPlanLoop).toHaveBeenCalledWith({ planID: 'plan-1', req })
  })

  it('approves an already-created remote draft without rerunning the agent', async () => {
    const req = {
      payload: {
        find: vi.fn(async () => ({ docs: [] })),
        findByID: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === 'agent-plans') return { id: 'plan-1', status: 'waiting' }
          if (collection === 'agent-plan-tasks') {
            return {
              id: 'task-doc-1',
              latestRun: 'run-1',
              plan: 'plan-1',
              status: 'needs-approval',
              taskID: 'draft',
            }
          }
          if (collection === 'agent-runs') {
            return {
              id: 'run-1',
              remoteDraft: {
                collection: 'pages',
                documentID: 'remote-1',
                payloadSite: 'site-1',
                status: 'created',
              },
            }
          }
          if (collection === 'payload-sites') return { id: 'site-1', baseURL: 'https://target.test' }
          throw new Error('not found')
        }),
        update: vi.fn(async (args: Record<string, unknown>) => ({
          id: args.id,
          ...(args.data as object),
        })),
      },
      routeParams: { id: 'plan-1', taskID: 'draft' },
      user: { id: 'user-1' },
    }

    const response = await getEndpoint('/:id/tasks/:taskID/approve').handler(req as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockedPublishDraftDocument).toHaveBeenCalledWith({
      collection: 'pages',
      id: 'remote-1',
      site: { id: 'site-1', baseURL: 'https://target.test' },
    })
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-runs',
        data: expect.objectContaining({
          remoteDraft: expect.objectContaining({
            response: { id: 'remote-1', _status: 'published' },
            status: 'published',
          }),
        }),
        id: 'run-1',
      }),
    )
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-plan-tasks',
        data: expect.objectContaining({
          status: 'succeeded',
        }),
        id: 'task-doc-1',
      }),
    )
    expect(mockedRefreshPlanStatus).toHaveBeenCalledWith({ planID: 'plan-1', req })
    expect(mockedRunPlanLoop).not.toHaveBeenCalled()
  })

  it('includes pending Payload approvals with plan tasks', async () => {
    const req = {
      payload: {
        find: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === 'agent-plan-tasks') {
            return {
              docs: [
                {
                  id: 'task-doc-1',
                  latestRun: 'run-1',
                  status: 'waiting',
                  taskID: 'draft',
                  title: 'Draft',
                },
              ],
              totalDocs: 1,
            }
          }
          if (collection === 'agent-approvals') {
            return {
              docs: [
                {
                  expiresAt: '2026-07-07T00:00:00.000Z',
                  id: 'approval-1',
                  prompt: 'Review generated draft?',
                  run: 'run-1',
                  title: 'Draft approval',
                },
              ],
            }
          }
          return { docs: [] }
        }),
        findByID: vi.fn(async () => ({ id: 'plan-1', status: 'waiting' })),
      },
      routeParams: { id: 'plan-1' },
      user: { id: 'user-1' },
    }

    const response = await getEndpoint('/:id/tasks').handler(req as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.docs[0].pendingApproval).toEqual({
      expiresAt: '2026-07-07T00:00:00.000Z',
      id: 'approval-1',
      prompt: 'Review generated draft?',
      title: 'Draft approval',
    })
  })
})
