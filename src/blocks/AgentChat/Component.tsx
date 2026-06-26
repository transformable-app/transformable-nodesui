import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers as getHeaders } from 'next/headers'

import { AgentChatClient } from './Component.client'
import { checkRole } from '@/access/utilities'

type AgentRelation =
  | string
  | { id?: string; slug?: string; name?: string | null }
  | null
  | undefined

type Props = {
  agent?: AgentRelation
  description?: string | null
  title?: string | null
}

export async function AgentChatBlock({ agent, description, title }: Props) {
  const agentID = typeof agent === 'string' ? agent : agent?.id
  if (!agentID) return null

  const payload = await getPayload({ config: configPromise })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })

  if (!user) return null

  const result = await payload.find({
    collection: 'agents',
    depth: 1,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: {
      and: [{ id: { equals: agentID } }, { enabled: { equals: true } }],
    },
  })

  const resolvedAgent = result.docs[0]
  if (!resolvedAgent) return null

  return (
    <AgentChatClient
      agent={{
        adminWorkflowURL:
          checkRole(['Admin'], user) &&
          resolvedAgent.workflow &&
          typeof resolvedAgent.workflow === 'object'
            ? resolvedAgent.workflow.n8nURL
            : undefined,
        name: resolvedAgent.name,
        placeholder: resolvedAgent.placeholder,
        slug: resolvedAgent.slug,
        streamingEnabled: Boolean(resolvedAgent.streamingEnabled),
        welcomeMessage: resolvedAgent.welcomeMessage,
      }}
      description={description}
      title={title || resolvedAgent.name}
    />
  )
}
