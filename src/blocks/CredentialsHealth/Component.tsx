import { KeyRound } from 'lucide-react'

import { PageRange } from '@/components/PageRange'
import { QueryPagination } from '@/components/QueryPagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCredentials, getPaginatedCredentials, getRelationName } from '@/lib/n8n-dashboard'
import { formatDateTime } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type Props = {
  description?: string | null
  id?: string | null
  limit?: number | null
  onlyUnhealthy?: boolean | null
  pagingMode?: 'pagination' | 'preview' | null
  searchParams?: Record<string, string | string[] | undefined>
  server?: RelationValue
  title?: string | null
}

const getCurrentPage = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  const page = Number(candidate)

  return Number.isInteger(page) && page > 0 ? page : 1
}

export async function CredentialsHealthBlock({
  description,
  id,
  limit = 10,
  onlyUnhealthy,
  pagingMode = 'pagination',
  searchParams,
  server,
  title,
}: Props) {
  const serverID = typeof server === 'string' ? server : server?.id
  const pageSize = limit ?? 10
  const blockID = id || serverID || (onlyUnhealthy ? 'unhealthy' : 'all')
  const queryParam = `credentialPage-${blockID}`
  const currentPage = pagingMode === 'pagination' ? getCurrentPage(searchParams?.[queryParam]) : 1
  const credentialsResult =
    pagingMode === 'pagination'
      ? await getPaginatedCredentials({
          limit: pageSize,
          onlyUnhealthy: Boolean(onlyUnhealthy),
          page: currentPage,
          serverID,
        })
      : {
          docs: await getCredentials({
            limit: pageSize,
            onlyUnhealthy: Boolean(onlyUnhealthy),
            serverID,
          }),
          page: 1,
          totalDocs: 0,
          totalPages: 1,
        }
  const credentials = credentialsResult.docs

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
            plural: 'Credentials',
            singular: 'Credential',
          }}
          currentPage={credentialsResult.page}
          limit={pageSize}
          totalDocs={credentialsResult.totalDocs}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {credentials.length === 0 ? (
          <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground lg:col-span-2">
            No credentials found.
          </div>
        ) : null}

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

      {pagingMode === 'pagination' && credentialsResult.totalPages > 1 ? (
        <QueryPagination
          page={credentialsResult.page}
          queryParam={queryParam}
          totalPages={credentialsResult.totalPages}
        />
      ) : null}
    </section>
  )
}
