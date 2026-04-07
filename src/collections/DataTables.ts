import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'

export const DataTables: CollectionConfig = {
  slug: 'data-tables',
  labels: {
    plural: 'Data Tables',
    singular: 'Data Table',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'server', 'rowCount', 'lastRefreshedAt'],
    useAsTitle: 'name',
  },
  defaultPopulate: {
    lastRefreshedAt: true,
    name: true,
    rowCount: true,
    server: true,
    slug: true,
    tableID: true,
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
      name: 'sourceKey',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'Optional stable key for job-managed tables, for example "<server-id>:daily-revenue".',
      },
    },
    {
      name: 'tableID',
      type: 'text',
      label: 'Table ID',
      index: true,
      admin: {
        description: 'n8n data table ID. Use sourceKey for globally unique upserts across multiple servers.',
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
      name: 'projectID',
      type: 'text',
      label: 'Project ID',
      admin: {
        description: 'n8n project or personal-space identifier when available.',
      },
    },
    {
      name: 'scope',
      type: 'select',
      defaultValue: 'project',
      options: [
        { label: 'Project', value: 'project' },
        { label: 'Personal', value: 'personal' },
      ],
      required: true,
      admin: {
        description: 'n8n data tables are scoped to a project or a personal space.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'sourcePath',
      type: 'text',
      admin: {
        description: 'Optional API path or workflow identifier that produced this dataset.',
      },
    },
    {
      name: 'columns',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          options: [
            { label: 'String', value: 'string' },
            { label: 'Number', value: 'number' },
            { label: 'Boolean', value: 'boolean' },
            { label: 'Date', value: 'date' },
            { label: 'JSON', value: 'json' },
          ],
        },
        {
          name: 'columnID',
          type: 'text',
          label: 'Column ID',
          admin: {
            description: 'n8n column ID from the Data Table API.',
          },
        },
        {
          name: 'index',
          type: 'number',
          min: 0,
        },
        {
          name: 'displayName',
          type: 'text',
        },
        {
          name: 'key',
          type: 'text',
          admin: {
            description: 'Legacy alias retained for viewer compatibility and migration support.',
          },
        },
        {
          name: 'label',
          type: 'text',
          admin: {
            description: 'Legacy alias retained for viewer compatibility and migration support.',
          },
        },
      ],
    },
    {
      name: 'rowCount',
      type: 'number',
      min: 0,
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'lastRefreshedAt',
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
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        const nextData = data ?? {}
        const columns = Array.isArray(nextData.columns) ? nextData.columns : []

        nextData.columns = columns.map((column) => {
          const nextColumn = { ...column }
          const normalizedName =
            typeof nextColumn.name === 'string' && nextColumn.name.length > 0
              ? nextColumn.name
              : nextColumn.key

          const normalizedDisplayName =
            typeof nextColumn.displayName === 'string' && nextColumn.displayName.length > 0
              ? nextColumn.displayName
              : nextColumn.label || normalizedName

          nextColumn.name = normalizedName
          nextColumn.key = normalizedName
          nextColumn.displayName = normalizedDisplayName
          nextColumn.label = normalizedDisplayName

          return nextColumn
        })

        return nextData
      },
    ],
  },
  timestamps: true,
}
