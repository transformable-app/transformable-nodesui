import type { Block } from 'payload'

export const AgentPlanBlock: Block = {
  slug: 'agentPlan',
  interfaceName: 'AgentPlanBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Agent plan',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
