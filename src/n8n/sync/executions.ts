import { fetchN8nPages } from './fetchPage'

export type N8nExecution = {
  id: number | string
  customData?: Record<string, unknown>
  data?: Record<string, unknown>
  finished?: boolean
  mode?: string
  retryOf?: number | string | null
  retrySuccessId?: number | string | null
  startedAt?: string | null
  status?: 'canceled' | 'crashed' | 'error' | 'new' | 'running' | 'success' | 'unknown' | 'waiting'
  stoppedAt?: string | null
  waitTill?: string | null
  workflowId?: number | string
}

export const fetchN8nExecutions = async (baseAPIURL: string, apiKey: string) => {
  const url = new URL(`${baseAPIURL}/executions`)
  url.searchParams.set('limit', '100')
  url.searchParams.set('includeData', 'true')

  // The default list excludes running executions. Fetch them first so history
  // wins if an execution finishes between the two queries.
  const runningURL = new URL(url)
  runningURL.searchParams.set('status', 'running')
  const running = await fetchN8nPages<N8nExecution>(runningURL, apiKey)
  const history = await fetchN8nPages<N8nExecution>(url, apiKey)

  const executions = new Map<string, N8nExecution>()
  for (const execution of [...running, ...history]) {
    executions.set(String(execution.id), execution)
  }
  return [...executions.values()]
}
