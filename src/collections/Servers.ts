import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'
import { environmentOptions, serverStatusOptions } from '@/n8n/constants'

const fieldAccess = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)

export const Servers: CollectionConfig = {
  slug: 'servers',
  labels: {
    plural: 'Servers',
    singular: 'Server',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'environment', 'status', 'syncEnabled', 'lastSyncedAt'],
    useAsTitle: 'name',
  },
  defaultPopulate: {
    apiPath: true,
    dashboardURL: true,
    environment: true,
    lastSuccessfulSyncAt: true,
    name: true,
    slug: true,
    status: true,
    syncEnabled: true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'environment',
      type: 'select',
      options: environmentOptions,
      defaultValue: 'production',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      options: serverStatusOptions,
      defaultValue: 'unknown',
      required: true,
    },
    {
      name: 'baseURL',
      type: 'text',
      required: true,
      admin: {
        description: 'Base URL for the n8n instance, for example https://n8n.example.com.',
      },
    },
    {
      name: 'apiPath',
      type: 'text',
      defaultValue: '/api/v1',
      required: true,
      admin: {
        description: 'API base path used by the sync job. Defaults to /api/v1 for self-hosted n8n.',
      },
    },
    {
      name: 'dashboardURL',
      type: 'text',
      admin: {
        description: 'Optional direct link to the n8n UI for this server.',
      },
    },
    {
      name: 'apiKey',
      type: 'text',
      required: true,
      access: {
        read: fieldAccess,
        update: fieldAccess,
      },
      admin: {
        description: 'Stored for future n8n sync jobs. Hidden from public reads.',
      },
    },
    {
      name: 'syncEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'When enabled, the Payload sync job will import data from this n8n server.',
      },
    },
    {
      name: 'healthSummary',
      type: 'textarea',
    },
    {
      name: 'lastSyncedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'lastSuccessfulSyncAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        readOnly: true,
      },
    },
    {
      name: 'lastSyncStatus',
      type: 'select',
      options: [
        { label: 'Idle', value: 'idle' },
        { label: 'Running', value: 'running' },
        { label: 'Succeeded', value: 'success' },
        { label: 'Failed', value: 'error' },
      ],
      defaultValue: 'idle',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'lastSyncError',
      type: 'textarea',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'syncCursor',
      type: 'json',
      admin: {
        description: 'Opaque checkpoint data for incremental syncs, such as pagination or updated-after cursors.',
      },
    },
  ],
  timestamps: true,
}
