import type { Block } from 'payload'

export const AgentChatBlock: Block = {
  slug: 'agentChat',
  interfaceName: 'AgentChatBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Agent chat',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      required: true,
      admin: {
        description: 'Only enabled agents visible to the current user can be invoked.',
      },
    },
  ],
}
