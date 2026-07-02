import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkCompanionPlugin } from '@/payloadSites/companionPlugin'
import { payloadSiteCollectionEndpoints } from '@/endpoints/payloadSites'

vi.mock('@/payloadSites/companionPlugin', () => ({
  checkCompanionPlugin: vi.fn(),
}))

const mockedCheckCompanionPlugin = vi.mocked(checkCompanionPlugin)

const getEndpoint = (path: string) => {
  const endpoint = payloadSiteCollectionEndpoints.find((candidate) => candidate.path === path)
  if (!endpoint) throw new Error(`Endpoint ${path} not found.`)
  return endpoint
}

const makeReq = (
  site: Record<string, unknown>,
  user: Record<string, unknown> | null = { id: 'user-1', roles: ['Admin'] },
) => ({
  payload: {
    findByID: vi.fn(async () => site),
    update: vi.fn(async (args: Record<string, unknown>) => ({ id: site.id, ...(args.data as object) })),
  },
  routeParams: { id: site.id },
  user,
})

describe('payload-sites endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires an Admin user', async () => {
    const req = makeReq({ id: 'site-1' }, { roles: ['Editor'] })
    const endpoint = getEndpoint('/:id/check-companion-plugin')

    await expect(endpoint.handler(req as never)).rejects.toThrow('Unauthorized')
    expect(mockedCheckCompanionPlugin).not.toHaveBeenCalled()
  })

  it('updates companion plugin and schema status on check', async () => {
    const site = {
      id: 'site-1',
      apiKeyAuthCollection: 'users',
      apiKeySecretReference: 'secret-ref',
      baseURL: 'https://target.test',
      schemaProfileEndpoint: '/api/nodesui/schema-profile',
    }
    const req = makeReq(site)
    mockedCheckCompanionPlugin.mockResolvedValue({
      companionPluginStatus: 'connected',
      ok: true,
      schemaProfileStatus: 'synced',
    })

    const response = await getEndpoint('/:id/check-companion-plugin').handler(req as never)

    expect(response.status).toBe(200)
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-sites',
        data: expect.objectContaining({
          companionPluginStatus: 'connected',
          schemaProfileStatus: 'synced',
        }),
        id: 'site-1',
        req,
      }),
    )
  })

  it('marks schema stale and disables write-back when synced profile hash changes', async () => {
    const site = {
      id: 'site-1',
      apiKeyAuthCollection: 'users',
      apiKeySecretReference: 'secret-ref',
      baseURL: 'https://target.test',
      schemaProfileEndpoint: '/api/nodesui/schema-profile',
      schemaProfileHash: 'old-hash',
      writeBackEnabled: true,
    }
    const req = makeReq(site)
    mockedCheckCompanionPlugin.mockResolvedValue({
      capabilities: { drafts: true },
      companionPluginStatus: 'connected',
      ok: true,
      profileHash: 'new-hash',
      schemaProfile: { collections: [], plugin: { version: '0.1.0' } },
      schemaProfileStatus: 'synced',
    })

    const response = await getEndpoint('/:id/sync-schema-profile').handler(req as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.schemaProfileStatus).toBe('stale')
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schemaProfileHash: 'new-hash',
          schemaProfileStatus: 'stale',
          writeBackEnabled: false,
        }),
      }),
    )
  })

  it('accepts a stale schema profile and records reviewer metadata', async () => {
    const site = {
      id: 'site-1',
      schemaProfileHash: 'new-hash',
      schemaProfileStatus: 'stale',
      writeBackEnabled: false,
    }
    const req = makeReq(site)

    const response = await getEndpoint('/:id/accept-schema-profile').handler(req as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.schemaProfileStatus).toBe('synced')
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-sites',
        data: expect.objectContaining({
          schemaProfileReviewedBy: 'user-1',
          schemaProfileStatus: 'synced',
        }),
        id: 'site-1',
      }),
    )
    expect(req.payload.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ writeBackEnabled: true }),
      }),
    )
  })
})
