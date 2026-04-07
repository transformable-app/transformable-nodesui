import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'
import { workflowStatusOptions } from '@/n8n/constants'

export const Workflows: CollectionConfig = {
  slug: 'workflows',
  labels: {
    plural: 'Workflows',
    singular: 'Workflow',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'server', 'workflowID', 'status', 'active', 'lastExecutionAt'],
    useAsTitle: 'name',
  },
  defaultPopulate: {
    active: true,
    lastExecutionAt: true,
    n8nURL: true,
    name: true,
    server: true,
    sourceKey: true,
    status: true,
    workflowID: true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'workflowID',
      type: 'text',
      label: 'Workflow ID',
      required: true,
      index: true,
      admin: {
        description: 'Raw workflow ID returned by n8n. Not globally unique across multiple servers.',
      },
    },
    {
      name: 'sourceKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Stable sync key in the form "<server-id>:<workflowID>". Used for idempotent upserts.',
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
      name: 'status',
      type: 'select',
      options: workflowStatusOptions,
      defaultValue: 'active',
      required: true,
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'projectID',
      type: 'text',
      label: 'Project ID',
    },
    {
      name: 'versionID',
      type: 'text',
      label: 'Version ID',
    },
    {
      name: 'triggerCount',
      type: 'number',
      min: 0,
    },
    {
      name: 'nodeCount',
      type: 'number',
      min: 0,
    },
    {
      name: 'n8nURL',
      type: 'text',
      label: 'n8n URL',
      admin: {
        description: 'Link to open the workflow in n8n.',
      },
    },
    {
      name: 'lastExecutionAt',
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
      name: 'remoteCreatedAt',
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
      name: 'notes',
      type: 'textarea',
    },
    {
      name: 'settings',
      type: 'json',
    },
    {
      name: 'apiData',
      type: 'json',
      admin: {
        description: 'Raw workflow payload from the n8n API.',
      },
    },
  ],
  timestamps: true,
}
