import type { Block } from 'payload'

export const CredentialsHealthBlock: Block = {
  slug: 'credentialsHealth',
  interfaceName: 'CredentialsHealthBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Credentials health',
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
      defaultValue: 10,
      max: 30,
      min: 1,
      required: true,
    },
    {
      name: 'onlyUnhealthy',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}
