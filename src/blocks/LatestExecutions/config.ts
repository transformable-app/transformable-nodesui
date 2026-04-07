import type { Block } from 'payload'

export const LatestExecutionsBlock: Block = {
  slug: 'latestExecutions',
  interfaceName: 'LatestExecutionsBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Latest executions',
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
      name: 'workflow',
      type: 'relationship',
      relationTo: 'workflows',
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 10,
      max: 30,
      min: 1,
      required: true,
    },
  ],
}
