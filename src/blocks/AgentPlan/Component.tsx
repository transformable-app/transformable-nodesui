import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers as getHeaders } from 'next/headers'

import { AgentPlanClient } from './Component.client'

type Props = {
  description?: string | null
  title?: string | null
}

const getRelationshipID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

export async function AgentPlanBlock({ description, title }: Props) {
  const payload = await getPayload({ config: configPromise })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })

  if (!user) return null

  const [agentsResult, sitesResult] = await Promise.all([
    payload.find({
      collection: 'agents',
      depth: 0,
      limit: 100,
      overrideAccess: false,
      pagination: false,
      sort: 'name',
      user,
      where: {
        and: [{ enabled: { equals: true } }, { inputMode: { equals: 'structured' } }],
      },
    }),
    payload.find({
      collection: 'payload-sites',
      depth: 0,
      limit: 100,
      overrideAccess: false,
      pagination: false,
      sort: 'name',
      user,
      where: {
        and: [
          { enabled: { equals: true } },
          { writeBackEnabled: { equals: true } },
          { companionPluginStatus: { equals: 'connected' } },
          { schemaProfileStatus: { equals: 'synced' } },
        ],
      },
    }),
  ])

  return (
    <AgentPlanClient
      agents={agentsResult.docs.map((agent) => ({
        id: String(agent.id),
        name: agent.name,
        outputBinding: agent.outputBinding,
        slug: agent.slug,
      }))}
      description={description}
      payloadSites={sitesResult.docs.map((site) => ({
        allowedCollections: site.allowedCollections?.filter((item): item is string => typeof item === 'string') ?? [],
        id: String(site.id),
        name: site.name,
        schemaProfileHash: site.schemaProfileHash,
        slug: site.slug,
      }))}
      title={title}
      userID={getRelationshipID(user) ?? String(user.id)}
    />
  )
}
