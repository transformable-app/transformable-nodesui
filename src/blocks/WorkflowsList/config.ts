import type { Block } from 'payload'

export const WorkflowsListBlock: Block = {
  slug: 'workflowsList',
  interfaceName: 'WorkflowsListBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Workflows',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'server',
      type: 'relationship',
      relationTo: 'servers',
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 8,
      max: 30,
      min: 1,
      required: true,
    },
    {
      name: 'showServer',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}
