import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers as getHeaders } from 'next/headers'

import { normalizeOutputBinding } from '@/n8n/agents/plans/validatePlan'

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
      overrideAccess: false,
      pagination: false,
      select: { inputMode: true, name: true, outputBinding: true, slug: true },
      sort: 'name',
      user,
      where: { enabled: { equals: true } },
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

  const agents = agentsResult.docs.filter((agent) => {
    if (agent.inputMode === 'structured') return true

    const errors: string[] = []
    const binding = normalizeOutputBinding({
      errors,
      label: 'outputBinding',
      value: agent.outputBinding,
    })
    return Boolean(binding && errors.length === 0)
  })

  return (
    <AgentPlanClient
      agents={agents.map((agent) => ({
        id: String(agent.id),
        name: agent.name,
        outputBinding: agent.outputBinding,
        slug: agent.slug,
      }))}
      description={description}
      payloadSites={sitesResult.docs.map((site) => ({
        allowedCollections: site.allowedCollections?.filter((slug) => {
          const profile = site.schemaProfile
          if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false
          return Array.isArray(profile.collections) && profile.collections.some(
            (collection) => collection?.slug === slug && collection.draftSupport === true,
          )
        }) ?? [],
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
