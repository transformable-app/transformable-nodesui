import { beforeEach, describe, expect, it, vi } from 'vitest'

import { finalizePlanTask } from '@/n8n/agents/plans/finalizeTask'
import { recordCMSDraftWriteFailure, writeCMSDraftFromTaskOutput } from '@/n8n/agents/plans/cmsDraftWriter'
import { createRemoteDraftPublishApproval } from '@/n8n/agents/plans/remoteDraftApproval'

vi.mock('@/n8n/agents/plans/cmsDraftWriter', async () => {
  const actual = await vi.importActual<typeof import('@/n8n/agents/plans/cmsDraftWriter')>(
    '@/n8n/agents/plans/cmsDraftWriter',
  )
  return {
    ...actual,
    recordCMSDraftWriteFailure: vi.fn(),
    writeCMSDraftFromTaskOutput: vi.fn(),
  }
})

vi.mock('@/n8n/agents/plans/remoteDraftApproval', () => ({
  createRemoteDraftPublishApproval: vi.fn(),
}))

const mockedWriteCMSDraftFromTaskOutput = vi.mocked(writeCMSDraftFromTaskOutput)
const mockedRecordCMSDraftWriteFailure = vi.mocked(recordCMSDraftWriteFailure)
const mockedCreateRemoteDraftPublishApproval = vi.mocked(createRemoteDraftPublishApproval)

const makeReq = () => ({
  payload: {
    find: vi.fn(async () => ({ docs: [{ status: 'succeeded' }] })),
    findByID: vi.fn(async () => ({
      expectedOutput: { type: 'cms-draft' },
      id: 'task-1',
      outputBinding: { collection: 'pages', payloadSite: 'primary' },
      plan: 'plan-1',
    })),
    update: vi.fn(async (args: Record<string, unknown>) => ({
      id: args.id,
      plan: 'plan-1',
      ...(args.data as object),
    })),
  },
})

describe('cms-draft finalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateRemoteDraftPublishApproval.mockResolvedValue({ id: 'approval-1' } as never)
    mockedRecordCMSDraftWriteFailure.mockResolvedValue({} as never)
    mockedWriteCMSDraftFromTaskOutput.mockResolvedValue({ status: 'created' } as never)
  })

  it('pauses a successful cms-draft task for approval after remote draft write succeeds', async () => {
    const req = makeReq()
    const response = {
      content: 'done',
      data: { document: { title: 'Draft' } },
      status: 'succeeded' as const,
    }

    await finalizePlanTask({
      req: req as never,
      response,
      runID: 'run-1',
      taskID: 'task-1',
    })

    expect(mockedWriteCMSDraftFromTaskOutput).toHaveBeenCalledWith({
      outputBinding: { collection: 'pages', payloadSite: 'primary' },
      output: response.data,
      req,
      runID: 'run-1',
    })
    expect(mockedCreateRemoteDraftPublishApproval).toHaveBeenCalledWith({
      req,
      runID: 'run-1',
    })
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-plan-tasks',
        data: expect.objectContaining({
          errorMessage: undefined,
          finishedAt: undefined,
          status: 'needs-approval',
        }),
        id: 'task-1',
      }),
    )
  })

  it('records remote draft failure and marks the task failed when write-back fails', async () => {
    const req = makeReq()
    mockedWriteCMSDraftFromTaskOutput.mockRejectedValue(new Error('Payload site write-back is not enabled.'))

    await finalizePlanTask({
      req: req as never,
      response: {
        content: 'done',
        data: { document: { title: 'Draft' } },
        status: 'succeeded',
      },
      runID: 'run-1',
      taskID: 'task-1',
    })

    expect(mockedRecordCMSDraftWriteFailure).toHaveBeenCalledWith({
      error: 'Payload site write-back is not enabled.',
      req,
      runID: 'run-1',
    })
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-plan-tasks',
        data: expect.objectContaining({
          errorCode: 'workflow-error',
          errorMessage: 'Payload site write-back is not enabled.',
          status: 'failed',
        }),
        id: 'task-1',
      }),
    )
  })
})
