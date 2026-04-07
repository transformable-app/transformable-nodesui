import { Activity, Clock3 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getExecutions, getRelationName } from '@/lib/n8n-dashboard'
import { formatDateTime, formatDuration } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type Props = {
  description?: string | null
  limit?: number | null
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

export async function LatestExecutionsBlock({
  description,
  limit = 10,
  server,
  title,
  workflow,
}: Props) {
  const serverID = typeof server === 'string' ? server : server?.id
  const workflowID = typeof workflow === 'string' ? workflow : workflow?.id
  const executions = await getExecutions({ limit: limit ?? 10, serverID, workflowID })

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {executions.map((execution) => (
          <Card className="bg-card" key={execution.id}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg text-foreground">{execution.executionID}</CardTitle>
                <Badge
                  variant={
                    executionVariantMap[execution.status as keyof typeof executionVariantMap] || 'muted'
                  }
                >
                  {execution.status || 'unknown'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Workflow</p>
                <p className="text-foreground">{getRelationName(execution.workflow)}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Server</p>
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
                  <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Error</p>
                  <p className="line-clamp-2 text-destructive">{execution.errorMessage}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
