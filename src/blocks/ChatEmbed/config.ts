import type { Block } from 'payload'

export const ChatEmbedBlock: Block = {
  slug: 'chatEmbed',
  interfaceName: 'ChatEmbedBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Ask the team bot',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'provider',
      type: 'text',
      defaultValue: 'n8n chat',
    },
    {
      name: 'embedURL',
      type: 'text',
      label: 'Embed URL',
      required: true,
    },
    {
      name: 'height',
      type: 'number',
      defaultValue: 560,
      max: 1200,
      min: 320,
      required: true,
    },
  ],
}
