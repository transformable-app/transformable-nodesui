import { KeyRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCredentials, getRelationName } from '@/lib/n8n-dashboard'
import { formatDateTime } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type Props = {
  description?: string | null
  limit?: number | null
  onlyUnhealthy?: boolean | null
  server?: RelationValue
  title?: string | null
}

export async function CredentialsHealthBlock({
  description,
  limit = 10,
  onlyUnhealthy,
  server,
  title,
}: Props) {
  const serverID = typeof server === 'string' ? server : server?.id
  const credentials = await getCredentials({
    limit: limit ?? 10,
    onlyUnhealthy: Boolean(onlyUnhealthy),
    serverID,
  })

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {credentials.map((credential) => (
          <Card className="bg-card" key={credential.id}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg text-foreground">{credential.name}</CardTitle>
                <Badge variant={credential.isHealthy ? 'success' : 'danger'}>
                  {credential.isHealthy ? 'healthy' : 'unhealthy'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Type
                </p>
                <p className="text-foreground">{credential.credentialType || 'Unknown'}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Server
                </p>
                <p className="text-foreground">{getRelationName(credential.server)}</p>
              </div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <span>Updated {formatDateTime(credential.remoteUpdatedAt)}</span>
              </div>
              {credential.summary ? (
                <div className="md:col-span-2">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Summary
                  </p>
                  <p className="line-clamp-2 text-foreground">{credential.summary}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
