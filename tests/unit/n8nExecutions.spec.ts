import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchN8nExecutions } from '@/n8n/sync/executions'
import { fetchN8nPages } from '@/n8n/sync/fetchPage'

beforeEach(() => vi.stubEnv('N8N_API_REQUEST_DELAY_MS', '0'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('n8n 2.40 execution sync', () => {
  it('paginates running and default lists with detailed data and independent cursors', async () => {
    const urls: URL[] = []
    const errorData = { resultData: { error: { message: 'Workflow failed', stack: 'stack' } } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        urls.push(new URL(url))
        const running = url.searchParams.get('status') === 'running'
        const cursor = url.searchParams.get('cursor')
        return Response.json(
          running
            ? cursor
              ? { data: [{ id: '2', status: 'running', startedAt: null }], nextCursor: null }
              : { data: [{ id: '1', status: 'running' }], nextCursor: 'running-page2' }
            : cursor
              ? { data: [{ id: '4', status: 'waiting' }], nextCursor: null }
              : {
                  data: [{ id: '3', status: 'error', data: errorData }],
                  nextCursor: 'history-page2',
                },
        )
      }),
    )
    const executions = await fetchN8nExecutions('https://n8n.example.com/api/v1', 'key')
    expect(executions.map((execution) => String(execution.id))).toEqual(['1', '2', '3', '4'])
    expect(executions.find((execution) => execution.id === '3')?.data).toEqual(errorData)
    expect(urls.map((url) => url.searchParams.get('cursor'))).toEqual([
      null,
      'running-page2',
      null,
      'history-page2',
    ])
    expect(urls.map((url) => url.searchParams.get('status'))).toEqual([
      'running',
      'running',
      null,
      null,
    ])
    for (const url of urls) {
      expect(url.searchParams.get('includeData')).toBe('true')
      expect(url.searchParams.get('limit')).toBe('100')
      expect(url.searchParams.has('ignoreDataSizeLimit')).toBe(false)
      expect(url.searchParams.has('redactExecutionData')).toBe(false)
    }
  })

  it('keeps the terminal record when an execution finishes during sync', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: 42, status: 'running' }],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: '42', status: 'success', stoppedAt: '2026-10-03T12:00:00Z' }],
          nextCursor: null,
        }),
      )
    vi.stubGlobal('fetch', fetch)
    const executions = await fetchN8nExecutions('https://n8n.example.com/api/v1', 'key')
    expect(executions).toEqual([{ id: '42', status: 'success', stoppedAt: '2026-10-03T12:00:00Z' }])
  })

  it('fails the sync when the running query is denied instead of silently omitting records', async () => {
    const fetch = vi.fn(async () => new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchN8nExecutions('https://n8n.example.com/api/v1', 'key')).rejects.toThrow(
      '(403)',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['/credentials', '/data-tables', '/data-tables/table-1/rows', '/workflows'])(
    'preserves cursor pagination for %s',
    async (path) => {
      const urls: URL[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: URL) => {
          urls.push(new URL(url))
          return Response.json(
            url.searchParams.has('cursor')
              ? { data: [{ id: 'second' }], nextCursor: null }
              : { data: [{ id: 'first' }], nextCursor: 'next-page' },
          )
        }),
      )
      const result = await fetchN8nPages(
        new URL(`https://n8n.example.com/api/v1${path}?limit=100`),
        'key',
      )
      expect(result).toEqual([{ id: 'first' }, { id: 'second' }])
      expect(urls[1].searchParams.get('cursor')).toBe('next-page')
      expect(urls[1].pathname).toBe(`/api/v1${path}`)
    },
  )
})
