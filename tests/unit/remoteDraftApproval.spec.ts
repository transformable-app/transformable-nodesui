import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createRemoteDraftPublishApproval,
  resolveRemoteDraftPublishApproval,
} from '@/n8n/agents/plans/remoteDraftApproval'
import { publishDraftDocument } from '@/payloadSites/client'

vi.mock('@/payloadSites/client', () => ({
  publishDraftDocument: vi.fn(),
}))

const mockedPublishDraftDocument = vi.mocked(publishDraftDocument)

describe('remote draft publish approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPublishDraftDocument.mockResolvedValue({ id: 'remote-1', _status: 'published' })
  })

  it('creates one pending Payload approval for a created remote draft', async () => {
    const req = {
      payload: {
        create: vi.fn(async (args: Record<string, unknown>) => ({ id: 'approval-1', ...(args.data as object) })),
        find: vi.fn(async () => ({ docs: [] })),
        findByID: vi.fn(async () => ({
          agent: 'agent-1',
          id: 'run-1',
          remoteDraft: {
            adminURL: 'https://target.test/admin/collections/pages/remote-1',
            collection: 'pages',
            documentID: 'remote-1',
            payloadSite: 'site-1',
            status: 'created',
          },
          session: 'session-1',
          user: 'user-1',
        })),
      },
    }

    const approval = await createRemoteDraftPublishApproval({ req: req as never, runID: 'run-1' })

    expect(approval).toEqual(expect.objectContaining({ approvalType: 'remote-draft-publish' }))
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'agent-approvals',
        data: expect.objectContaining({
          approvalType: 'remote-draft-publish',
          run: 'run-1',
          status: 'pending',
        }),
      }),
    )
  })

  it('publishes the remote draft and records a publish audit when approved', async () => {
    const created: Array<Record<string, unknown>> = []
    const updated: Array<Record<string, unknown>> = []
    const req = {
      payload: {
        create: vi.fn(async (args: Record<string, unknown>) => {
          created.push(args)
          return args.data
        }),
        find: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === 'agent-plan-tasks') return { docs: [{ id: 'task-1', status: 'succeeded' }] }
          return { docs: [] }
        }),
        findByID: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === 'agent-runs') {
            return {
              id: 'run-1',
              plan: 'plan-1',
              planTask: 'task-1',
              remoteDraft: {
                adminURL: 'https://target.test/admin/collections/pages/remote-1',
                collection: 'pages',
                documentID: 'remote-1',
                mediaIDs: ['media-1'],
                payloadSite: 'site-1',
                previewURL: 'https://target.test/preview/pages/remote-1',
                status: 'created',
                versionID: 'version-1',
              },
            }
          }
          if (collection === 'payload-sites') return { id: 'site-1', baseURL: 'https://target.test' }
          throw new Error('not found')
        }),
        update: vi.fn(async (args: Record<string, unknown>) => {
          updated.push(args)
          return { id: args.id, ...(args.data as object) }
        }),
      },
    }

    await resolveRemoteDraftPublishApproval({
      approval: { id: 'approval-1', run: 'run-1' } as never,
      approved: true,
      req: req as never,
    })

    expect(mockedPublishDraftDocument).toHaveBeenCalledWith({
      collection: 'pages',
      id: 'remote-1',
      site: { id: 'site-1', baseURL: 'https://target.test' },
    })
    expect(updated).toEqual(
      expect.arrayContaining([
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
        expect.objectContaining({
          collection: 'agent-plan-tasks',
          data: expect.objectContaining({ status: 'succeeded' }),
          id: 'task-1',
        }),
      ]),
    )
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: 'remote-draft-audits',
          data: expect.objectContaining({
            collection: 'pages',
            operation: 'publish',
            payloadSite: 'site-1',
            remoteDocumentID: 'remote-1',
            run: 'run-1',
            status: 'succeeded',
          }),
        }),
      ]),
    )
  })
})
