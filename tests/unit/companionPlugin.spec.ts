import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkCompanionPlugin } from '@/payloadSites/companionPlugin'

const site = { apiKey: 'test-api-key', baseURL: 'https://target.test' }
const endpoint = 'https://target.test/api/nodesui/schema-profile'

describe('companion plugin detection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the saved key and detects a valid schema profile', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        schemaProfile: {
          collections: [{ slug: 'pages' }],
          plugin: { compatible: true, name: 'nodesui-companion', version: '0.1.0' },
        },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    await expect(checkCompanionPlugin(site)).resolves.toMatchObject({
      companionPluginStatus: 'connected',
      ok: true,
    })
    expect(fetch).toHaveBeenCalledWith(endpoint, {
      headers: { accept: 'application/json', authorization: 'users API-Key test-api-key' },
      method: 'GET',
    })
  })

  it.each([
    [404, 'missing', 'Check the endpoint path'],
    [401, 'error', 'Check the saved API key'],
    [403, 'error', 'Check the saved API key'],
  ])('classifies an HTML response with status %i', async (status, companionPluginStatus, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { status })))

    await expect(checkCompanionPlugin(site)).resolves.toMatchObject({
      companionPluginStatus,
      error: expect.stringContaining(message),
      ok: false,
    })
  })
})
