import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

export const Credentials: CollectionConfig = {
  slug: 'credentials',
  labels: {
    plural: 'Credentials',
    singular: 'Credential',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'credentialType', 'server', 'credentialID', 'isHealthy'],
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'credentialID',
      type: 'text',
      label: 'Credential ID',
      required: true,
      index: true,
      admin: {
        description: 'Raw credential ID returned by n8n. Not globally unique across multiple servers.',
      },
    },
    {
      name: 'sourceKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Stable sync key in the form "<server-id>:<credentialID>". Used for idempotent upserts.',
      },
    },
    {
      name: 'credentialType',
      type: 'text',
      required: true,
    },
    {
      name: 'server',
      type: 'relationship',
      relationTo: 'servers',
      required: true,
      index: true,
    },
    {
      name: 'isHealthy',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'isGlobal',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'isManaged',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'scopes',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'lastUsedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'remoteCreatedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'remoteUpdatedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        readOnly: true,
      },
    },
    {
      name: 'summary',
      type: 'textarea',
    },
    {
      name: 'dataPreview',
      type: 'json',
      admin: {
        description: 'Redacted credential payload returned by n8n when includeData=true.',
      },
    },
  ],
  timestamps: true,
}
