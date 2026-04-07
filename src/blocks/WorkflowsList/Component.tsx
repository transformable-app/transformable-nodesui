import { ArrowUpRight, Clock3, Workflow } from 'lucide-react'

import { PageRange } from '@/components/PageRange'
import { QueryPagination } from '@/components/QueryPagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPaginatedWorkflows, getRelationName, getWorkflows } from '@/lib/n8n-dashboard'
import { formatDateTime } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type Props = {
  description?: string | null
  id?: string | null
  limit?: number | null
  pagingMode?: 'pagination' | 'preview' | null
  searchParams?: Record<string, string | string[] | undefined>
  server?: RelationValue
  showServer?: boolean | null
  title?: string | null
}

const getCurrentPage = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  const page = Number(candidate)

  return Number.isInteger(page) && page > 0 ? page : 1
}

export async function WorkflowsListBlock({
  description,
  id,
  limit = 8,
  pagingMode = 'pagination',
  searchParams,
  server,
  showServer,
  title,
}: Props) {
  const serverID = typeof server === 'string' ? server : server?.id
  const pageSize = limit ?? 8
  const blockID = id || serverID || 'all'
  const queryParam = `workflowPage-${blockID}`
  const currentPage = pagingMode === 'pagination' ? getCurrentPage(searchParams?.[queryParam]) : 1
  const workflowsResult =
    pagingMode === 'pagination'
      ? await getPaginatedWorkflows({ limit: pageSize, page: currentPage, serverID })
      : {
          docs: await getWorkflows({ limit: pageSize, serverID }),
          page: 1,
          totalDocs: 0,
          totalPages: 1,
        }
  const workflows = workflowsResult.docs

  return (
    <section className="space-y-5" id={blockID || undefined}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg text-foreground">
            <Workflow className="h-5 w-5 text-primary" />
            Routed workflows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pagingMode === 'pagination' ? (
            <PageRange
              className="text-sm text-muted-foreground"
              collectionLabels={{
                plural: 'Workflows',
                singular: 'Workflow',
              }}
              currentPage={workflowsResult.page}
              limit={pageSize}
              totalDocs={workflowsResult.totalDocs}
            />
          ) : null}

          {workflows.length === 0 ? (
            <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              No workflows found.
            </div>
          ) : null}

          {workflows.map((workflow) => (
            <div
              className="grid gap-4 rounded-xl border bg-background px-4 py-4 md:grid-cols-[1.5fr,auto,auto]"
              key={workflow.id}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{workflow.name}</p>
                  <Badge variant={workflow.active ? 'success' : 'warning'}>
                    {workflow.active ? 'active' : 'paused'}
                  </Badge>
                  <Badge variant="muted">{workflow.status || 'unknown'}</Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {showServer ? <span>{getRelationName(workflow.server)}</span> : null}
                  {workflow.tags?.length ? <span>{workflow.tags.join(', ')}</span> : null}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4 text-primary" />
                {formatDateTime(workflow.lastExecutionAt || workflow.remoteUpdatedAt)}
              </div>

              {workflow.n8nURL ? (
                <a
                  className="inline-flex items-center justify-self-start gap-2 text-sm font-medium text-primary transition hover:text-secondary md:justify-self-end"
                  href={workflow.n8nURL}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          ))}

          {pagingMode === 'pagination' && workflowsResult.totalPages > 1 ? (
            <QueryPagination
              page={workflowsResult.page}
              queryParam={queryParam}
              totalPages={workflowsResult.totalPages}
            />
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
