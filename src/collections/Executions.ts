import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'
import { executionStatusOptions } from '@/n8n/constants'

const fieldAccess = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)

export const Executions: CollectionConfig = {
  slug: 'executions',
  labels: {
    plural: 'Executions',
    singular: 'Execution',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['executionID', 'workflow', 'server', 'status', 'mode', 'startedAt'],
    useAsTitle: 'executionID',
  },
  defaultPopulate: {
    durationMS: true,
    errorMessage: true,
    executionID: true,
    finishedAt: true,
    server: true,
    sourceKey: true,
    startedAt: true,
    status: true,
    workflow: true,
  },
  fields: [
    {
      name: 'executionID',
      type: 'text',
      label: 'Execution ID',
      required: true,
      index: true,
      admin: {
        description: 'Raw execution ID returned by n8n. Not globally unique across multiple servers.',
      },
    },
    {
      name: 'sourceKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Stable sync key in the form "<server-id>:<executionID>". Used for idempotent upserts.',
      },
    },
    {
      name: 'server',
      type: 'relationship',
      relationTo: 'servers',
      required: true,
      index: true,
    },
    {
      name: 'workflow',
      type: 'relationship',
      relationTo: 'workflows',
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      options: executionStatusOptions,
      defaultValue: 'success',
      required: true,
    },
    {
      name: 'mode',
      type: 'text',
    },
    {
      name: 'retryOf',
      type: 'text',
    },
    {
      name: 'waitTill',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'startedAt',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'finishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'durationMS',
      type: 'number',
      label: 'Duration MS',
      min: 0,
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
      name: 'errorMessage',
      type: 'textarea',
    },
    {
      name: 'errorStack',
      type: 'textarea',
      access: {
        read: fieldAccess,
        update: fieldAccess,
      },
      admin: {
        description: 'Visible to authenticated users only.',
      },
    },
    {
      name: 'payloadPreview',
      type: 'json',
    },
    {
      name: 'apiData',
      type: 'json',
      admin: {
        description: 'Raw execution payload from the n8n API for audit/debug purposes.',
      },
    },
  ],
  timestamps: true,
}
