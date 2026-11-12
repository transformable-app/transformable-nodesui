import { afterEach, describe, expect, it, vi } from 'vitest'

import { writeDraftDocument } from '@/payloadSites/client'

const writeDraft = () => writeDraftDocument({
  collection: 'pages',
  data: { title: 'Test draft' },
  operation: 'create',
  site: { apiKey: 'test-key', baseURL: 'https://target.test' },
})

describe('target Payload draft errors', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports the fields in a Payload validation response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      errors: [{ data: { errors: [{ path: 'layout.0.richText' }] } }],
    }, { status: 400 })))

    await expect(writeDraft()).rejects.toMatchObject({
      message: 'Payload site draft write failed with 400. Invalid fields: layout.0.richText.',
      status: 400,
    })
  })

  it('preserves a non-JSON server error status without exposing its body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Internal exception', { status: 500 })))

    await expect(writeDraft()).rejects.toMatchObject({
      message: 'Payload site draft write failed with 500. Check the target Payload server logs for the failed request.',
      status: 500,
    })
  })
})
