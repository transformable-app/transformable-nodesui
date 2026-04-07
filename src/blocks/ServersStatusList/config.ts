import type { Block } from 'payload'

import { serverStatusOptions } from '@/n8n/constants'

export const ServersStatusListBlock: Block = {
  slug: 'serversStatusList',
  interfaceName: 'ServersStatusListBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Server status',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 6,
      max: 24,
      min: 1,
      required: true,
    },
    {
      name: 'statuses',
      type: 'select',
      hasMany: true,
      options: serverStatusOptions,
    },
    {
      name: 'showEnvironment',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}
