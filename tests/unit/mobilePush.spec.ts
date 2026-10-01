import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { processMobilePushDeliveries, sendWorkflowFailurePush } from '@/notifications/mobilePush'

const user = { id: 'user-1', email: 'user@example.com' }
const execution = {
  id: 'execution-doc-1',
  executionID: 'n8n-42',
  server: 'server-1',
  workflow: 'workflow-1',
  startedAt: '2026-09-30T12:00:00.000Z',
  errorMessage: 'Bearer super-secret failed',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('mobile failure push delivery', () => {
  it('persists recipient-scoped identity before contacting Expo', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://nodes.example.com')
    const create = vi.fn(async () => ({}))
    const find = vi.fn(async (args: { collection: string }) =>
      args.collection === 'mobile-devices'
        ? {
            docs: [
              {
                id: 'device-1',
                user: 'user-1',
                token: 'ExponentPushToken[test]',
                mutedWorkflows: [],
              },
            ],
            totalPages: 1,
          }
        : { docs: [execution] },
    )
    const findByID = vi.fn(async (args: { collection: string }) =>
      args.collection === 'executions' ? execution : user,
    )
    const payload = {
      create,
      find,
      findByID,
      logger: { warn: vi.fn() },
    } as unknown as Payload

    await sendWorkflowFailurePush(payload, {
      executionID: 'n8n-42',
      executionDocID: 'execution-doc-1',
      startedAt: execution.startedAt,
      errorMessage: execution.errorMessage,
      serverID: 'server-1',
      serverName: 'Production',
      workflowID: 'workflow-1',
      workflowName: 'Orders',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'mobile-push-deliveries',
        data: expect.objectContaining({
          eventKey: 'server-1:n8n-42:user-1:device-1',
          notification: {
            type: 'workflow-execution-failed',
            executionID: 'execution-doc-1',
            deploymentOrigin: 'https://nodes.example.com',
            accountID: 'user-1',
          },
          display: expect.objectContaining({
            workflowName: 'Orders',
            errorMessage: 'Bearer [redacted] failed',
          }),
        }),
      }),
    )
  })

  it('sends the queued identity and records the Expo ticket for receipt processing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://nodes.example.com')
    const notification = {
      type: 'workflow-execution-failed',
      executionID: 'execution-doc-1',
      deploymentOrigin: 'https://nodes.example.com',
      accountID: 'user-1',
    }
    const row = {
      id: 'delivery-1',
      eventKey: 'server-1:n8n-42:user-1:device-1',
      status: 'pending',
      attempts: 0,
      device: {
        id: 'device-1',
        token: 'ExponentPushToken[test]',
        workflowFailuresEnabled: true,
        mutedWorkflows: [],
      },
      recipient: user,
      notification,
      execution,
      server: { id: 'server-1' },
      groupKey: 'server-1:workflow-1',
      display: {
        workflowName: 'Orders',
        serverName: 'Production',
        startedAt: execution.startedAt,
        errorMessage: 'failed',
      },
      createdAt: '2026-09-30T12:00:00.000Z',
    }
    const update = vi.fn(async () => ({}))
    const find = vi.fn(async (args: { collection: string }) =>
      args.collection === 'mobile-push-deliveries'
        ? { docs: [row], totalPages: 1 }
        : { docs: [execution] },
    )
    const findByID = vi.fn(async (args: { collection: string }) =>
      args.collection === 'users' ? user : execution,
    )
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ data: [{ status: 'ok', id: 'expo-ticket-1' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { find, findByID, update, logger: { warn: vi.fn() } } as unknown as Payload

    await processMobilePushDeliveries(payload)

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const requestBody = JSON.parse(String(requestInit.body))
    expect(requestBody[0].data).toEqual(notification)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'delivery-1',
        data: expect.objectContaining({ status: 'ticketed', ticketID: 'expo-ticket-1' }),
      }),
    )
  })
})
