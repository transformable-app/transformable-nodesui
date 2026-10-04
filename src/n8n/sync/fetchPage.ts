import { waitForN8nRequest } from './requestDelay'

type CursorPage<T> = { data: T[]; nextCursor?: string | null }

export const fetchN8nPages = async <T>(url: URL, apiKey: string): Promise<T[]> => {
  const pageURL = new URL(url)
  const data: T[] = []
  let cursor: string | undefined

  do {
    if (cursor) pageURL.searchParams.set('cursor', cursor)
    const page = await fetchN8nJSON<CursorPage<T>>(new URL(pageURL), apiKey)
    data.push(...page.data)
    cursor = page.nextCursor || undefined
  } while (cursor)

  return data
}

const transientStatuses = new Set([429, 502, 503, 504])
const maxAttempts = 4

// Retry the failed GET page, rather than restarting already completed sync writes.
export const fetchN8nJSON = async <T>(url: URL, apiKey: string): Promise<T> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForN8nRequest(url)
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-N8N-API-KEY': apiKey,
      },
      method: 'GET',
    })

    if (response.ok) return (await response.json()) as T

    const error = new Error(
      `n8n API request failed (${response.status}) for ${url.pathname} after ${attempt} attempt${attempt === 1 ? '' : 's'}`,
    )
    if (!transientStatuses.has(response.status) || attempt === maxAttempts) {
      await response.body?.cancel()
      throw error
    }

    const retryAfter = response.headers.get('retry-after')
    const retryAfterMS = retryAfter
      ? /^\d+$/.test(retryAfter.trim())
        ? Number(retryAfter) * 1000
        : Date.parse(retryAfter) - Date.now()
      : 0
    await response.body?.cancel()
    // Do not retry earlier than requested, or hold the sync open for long outages.
    if (retryAfterMS > 30_000) throw error
    const delayMS = Math.max(1000 * 2 ** (attempt - 1), retryAfterMS || 0)
    await new Promise<void>((resolve) => setTimeout(resolve, delayMS))
  }

  throw new Error('n8n API retry limit reached')
}
