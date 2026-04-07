import type { Block } from 'payload'

export const ExecutionErrorsBlock: Block = {
  slug: 'executionErrors',
  interfaceName: 'ExecutionErrorsBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Execution errors',
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
      defaultValue: 6,
      max: 20,
      min: 1,
      required: true,
    },
  ],
}
