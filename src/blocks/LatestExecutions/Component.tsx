import { Activity, Clock3 } from 'lucide-react'

import { PageRange } from '@/components/PageRange'
import { QueryPagination } from '@/components/QueryPagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getExecutions, getPaginatedExecutions, getRelationName } from '@/lib/n8n-dashboard'
import { formatDateTime, formatDuration } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type Props = {
  description?: string | null
  id?: string | null
  limit?: number | null
  pagingMode?: 'pagination' | 'preview' | null
  searchParams?: Record<string, string | string[] | undefined>
  server?: RelationValue
  title?: string | null
  workflow?: RelationValue
}

const executionVariantMap = {
  canceled: 'warning',
  error: 'danger',
  running: 'info',
  success: 'success',
  waiting: 'muted',
} as const

const getCurrentPage = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  const page = Number(candidate)

  return Number.isInteger(page) && page > 0 ? page : 1
}

export async function LatestExecutionsBlock({
  description,
  id,
  limit = 10,
  pagingMode = 'pagination',
  searchParams,
  server,
  title,
  workflow,
}: Props) {
  const serverID = typeof server === 'string' ? server : server?.id
  const workflowID = typeof workflow === 'string' ? workflow : workflow?.id
  const pageSize = limit ?? 10
  const blockID = id || workflowID || serverID || 'all'
  const queryParam = `executionPage-${blockID}`
  const currentPage = pagingMode === 'pagination' ? getCurrentPage(searchParams?.[queryParam]) : 1
  const executionsResult =
    pagingMode === 'pagination'
      ? await getPaginatedExecutions({ limit: pageSize, page: currentPage, serverID, workflowID })
      : {
          docs: await getExecutions({ limit: pageSize, serverID, workflowID }),
          page: 1,
          totalDocs: 0,
          totalPages: 1,
        }
  const executions = executionsResult.docs

  return (
    <section className="space-y-5" id={blockID || undefined}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {pagingMode === 'pagination' ? (
        <PageRange
          className="text-sm text-muted-foreground"
          collectionLabels={{
            plural: 'Executions',
            singular: 'Execution',
          }}
          currentPage={executionsResult.page}
          limit={pageSize}
          totalDocs={executionsResult.totalDocs}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {executions.length === 0 ? (
          <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground lg:col-span-2">
            No executions found.
          </div>
        ) : null}

        {executions.map((execution) => (
          <Card className="bg-card" key={execution.id}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg text-foreground">{execution.executionID}</CardTitle>
                <Badge
                  variant={
                    executionVariantMap[execution.status as keyof typeof executionVariantMap] ||
                    'muted'
                  }
                >
                  {execution.status || 'unknown'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Workflow
                </p>
                <p className="text-foreground">{getRelationName(execution.workflow)}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Server
                </p>
                <p className="text-foreground">{getRelationName(execution.server)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <span>{formatDateTime(execution.startedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span>{formatDuration(execution.durationMS)}</span>
              </div>
              {execution.errorMessage ? (
                <div className="md:col-span-2">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Error
                  </p>
                  <p className="line-clamp-2 text-destructive">{execution.errorMessage}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {pagingMode === 'pagination' && executionsResult.totalPages > 1 ? (
        <QueryPagination
          page={executionsResult.page}
          queryParam={queryParam}
          totalPages={executionsResult.totalPages}
        />
      ) : null}
    </section>
  )
}
