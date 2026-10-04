import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchN8nJSON } from '@/n8n/sync/fetchPage'

const url = new URL('https://n8n.example.com/api/v1/credentials?cursor=page2')

beforeEach(() => {
  vi.stubEnv('N8N_API_REQUEST_DELAY_MS', '0')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('n8n sync page retries', () => {
  it('recovers from a temporary 503 and preserves the page and credentials', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'credential-1' }] }))
    vi.stubGlobal('fetch', fetch)
    const result = fetchN8nJSON(url, 'test-key')
    await vi.runAllTimersAsync()
    expect(await result).toEqual({ data: [{ id: 'credential-1' }] })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      url,
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-N8N-API-KEY': 'test-key' },
        method: 'GET',
      }),
    )
  })

  it('stops after four attempts when the service remains unavailable', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => new Response('Unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    const assertion = expect(fetchN8nJSON(url, 'test-key')).rejects.toThrow(
      'n8n API request failed (503) for /api/v1/credentials after 4 attempts',
    )
    await vi.runAllTimersAsync()
    await assertion
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it.each([401, 403, 404])('does not retry HTTP %s', async (status) => {
    const fetch = vi.fn(async () => new Response('Rejected', { status }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchN8nJSON(url, 'test-key')).rejects.toThrow(`(${status})`)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('honors Retry-After before retrying', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Unavailable', {
          status: 503,
          headers: { 'Retry-After': '5' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }))
    vi.stubGlobal('fetch', fetch)
    const result = fetchN8nJSON(url, 'test-key')
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual({ data: [] })
  })

  it('fails promptly when Retry-After exceeds the bounded wait', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('Unavailable', {
          status: 503,
          headers: { 'Retry-After': '120' },
        }),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(fetchN8nJSON(url, 'test-key')).rejects.toThrow('after 1 attempt')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('paces overlapping sync calls to the same origin', async () => {
    vi.useFakeTimers()
    vi.stubEnv('N8N_API_REQUEST_DELAY_MS', '500')
    const starts: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        starts.push(Date.now())
        return Response.json({ data: [] })
      }),
    )
    const host = 'https://paced.example.com'
    const requests = [
      fetchN8nJSON(new URL(`${host}/api/v1/workflows`), 'key'),
      fetchN8nJSON(new URL(`${host}/api/v1/credentials`), 'key'),
      fetchN8nJSON(new URL(`${host}/api/v1/executions`), 'key'),
    ]
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(starts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(starts).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(500)
    await Promise.all(requests)
    expect(starts.map((start) => start - starts[0])).toEqual([0, 500, 1000])
  })

  it('allows different origins to start independently', async () => {
    vi.useFakeTimers()
    vi.stubEnv('N8N_API_REQUEST_DELAY_MS', '500')
    const fetch = vi.fn(async () => Response.json({ data: [] }))
    vi.stubGlobal('fetch', fetch)
    await Promise.all([
      fetchN8nJSON(new URL('https://first.example.com/api/v1/credentials'), 'key'),
      fetchN8nJSON(new URL('https://second.example.com/api/v1/credentials'), 'key'),
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries rate limiting using Retry-After', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Rate limited', {
          status: 429,
          headers: { 'Retry-After': '2' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }))
    vi.stubGlobal('fetch', fetch)
    const result = fetchN8nJSON(url, 'key')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual({ data: [] })
  })
})
