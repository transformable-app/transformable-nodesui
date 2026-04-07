import { ArrowUpRight, Server } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getServers } from '@/lib/n8n-dashboard'
import { formatDateTime } from '@/n8n/format'

const statusVariantMap = {
  degraded: 'warning',
  offline: 'danger',
  online: 'success',
  unknown: 'muted',
} as const

type Props = {
  description?: string | null
  limit?: number | null
  showEnvironment?: boolean | null
  title?: string | null
  statuses?: string[] | null
}

export async function ServersStatusListBlock({
  description,
  limit = 6,
  showEnvironment,
  statuses,
  title,
}: Props) {
  const servers = await getServers({
    limit: limit ?? 6,
    statuses: statuses || undefined,
  })

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {servers.map((server) => (
          <Card className="bg-card" key={server.id}>
            <CardHeader className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Badge variant={statusVariantMap[server.status as keyof typeof statusVariantMap] || 'muted'}>
                    {server.status || 'unknown'}
                  </Badge>
                  <CardTitle className="text-xl text-foreground">{server.name}</CardTitle>
                </div>
                <Server className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {server.healthSummary ? <p>{server.healthSummary}</p> : null}
              <div className="grid gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {showEnvironment ? (
                  <div>
                    <p className="mb-1 text-[10px] text-muted-foreground">Environment</p>
                    <p className="text-foreground">{server.environment || 'Unknown'}</p>
                  </div>
                ) : null}
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground">Last sync</p>
                  <p className="text-foreground">{formatDateTime(server.lastSyncedAt)}</p>
                </div>
              </div>
              {server.dashboardURL ? (
                <a
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:text-secondary"
                  href={server.dashboardURL}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in n8n
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
