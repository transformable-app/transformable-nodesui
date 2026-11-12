import type { PayloadRequest } from 'payload'

// Call after authorizing access to the agent. Only the invocation path needs the token.
export const getAgentInvocationSecret = async (req: PayloadRequest, agentID: string) => {
  const agent = await req.payload.findByID({
    collection: 'agents',
    depth: 0,
    id: agentID,
    overrideAccess: true,
    req,
    select: { encryptedInvocationSecret: true, secretReference: true },
    showHiddenFields: true,
  })

  if (agent.encryptedInvocationSecret) {
    return req.payload.decrypt(agent.encryptedInvocationSecret)
  }

  const reference = agent.secretReference?.trim()
  return reference ? process.env[reference] || null : null
}
