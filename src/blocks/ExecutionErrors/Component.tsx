import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getExecutions, getRelationName } from '@/lib/n8n-dashboard'
import { formatDateTime } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type Props = {
  description?: string | null
  limit?: number | null
  server?: RelationValue
  title?: string | null
}

export async function ExecutionErrorsBlock({
  description,
  limit = 6,
  server,
  title,
}: Props) {
  const serverID = typeof server === 'string' ? server : server?.id
  const executions = await getExecutions({ limit: limit ?? 6, onlyErrors: true, serverID })

  if (executions.length === 0) {
    return null
  }

  return (
    <section className="mb-10 space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {executions.map((execution) => (
          <Card className="border-primary/20 bg-primary/5" key={execution.id}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg text-foreground">{execution.executionID}</CardTitle>
                <Badge variant="danger">error</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-primary">
                <AlertTriangle className="h-4 w-4" />
                <span>{getRelationName(execution.workflow)} on {getRelationName(execution.server)}</span>
              </div>
              <p className="line-clamp-3 text-foreground">{execution.errorMessage || 'Unknown execution failure.'}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {formatDateTime(execution.startedAt)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
