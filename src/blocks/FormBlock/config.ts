import type { Block } from 'payload'

export const FormBlock: Block = {
  slug: 'formBlock',
  interfaceName: 'FormBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Get in touch',
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'form',
      type: 'relationship',
      relationTo: 'forms',
      required: true,
      admin: {
        description: 'Choose which form to render on the frontend.',
      },
    },
  ],
  labels: {
    plural: 'Forms',
    singular: 'Form',
  },
}
