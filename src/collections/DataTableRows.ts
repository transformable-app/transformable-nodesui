import type { CollectionConfig, PayloadRequest } from 'payload'

import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'

type ColumnDefinition = {
  key?: string | null
  name?: string | null
}

const getTableID = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id
  }

  return undefined
}

const syncTableRowCount = async ({
  req,
  tableID,
}: {
  req: PayloadRequest
  tableID: string
}) => {
  const { totalDocs } = await req.payload.find({
    collection: 'data-table-rows',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: true,
    req,
    where: {
      table: {
        equals: tableID,
      },
    },
  })

  await req.payload.update({
    collection: 'data-tables',
    id: tableID,
    data: {
      rowCount: totalDocs,
    },
    req,
  })
}

export const DataTableRows: CollectionConfig = {
  slug: 'data-table-rows',
  labels: {
    plural: 'Data Table Rows',
    singular: 'Data Table Row',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['table', 'rowIndex', 'rowID', 'createdAt', 'updatedAt'],
  },
  defaultSort: ['-createdAt', '-updatedAt'],
  defaultPopulate: {
    createdAt: true,
    rowID: true,
    rowIndex: true,
    table: true,
    updatedAt: true,
  },
  fields: [
    {
      name: 'table',
      type: 'relationship',
      relationTo: 'data-tables',
      required: true,
      index: true,
    },
    {
      name: 'sourceKey',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'Optional stable key for sync-managed rows, for example "<server-slug>:<table-id>:<row-id>".',
      },
    },
    {
      name: 'rowID',
      type: 'text',
      index: true,
      admin: {
        description: 'Remote row identifier when available.',
      },
    },
    {
      name: 'rowIndex',
      type: 'number',
      min: 0,
      index: true,
    },
    {
      name: 'data',
      type: 'json',
      required: true,
      admin: {
        description: 'Plain object keyed by the parent table column names.',
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
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const nextData = data ?? {}
        const tableID = getTableID(nextData.table) || getTableID(originalDoc?.table)

        if (!tableID) return nextData

        const table = await req.payload.findByID({
          collection: 'data-tables',
          depth: 0,
          id: tableID,
          overrideAccess: false,
          req,
        })

        const columns = Array.isArray(table.columns) ? (table.columns as ColumnDefinition[]) : []
        const allowedKeys = columns
          .map((column) => {
            if (typeof column.name === 'string' && column.name.length > 0) return column.name
            if (typeof column.key === 'string' && column.key.length > 0) return column.key
            return null
          })
          .filter((value): value is string => Boolean(value))

        const input =
          nextData.data && typeof nextData.data === 'object' && !Array.isArray(nextData.data)
            ? (nextData.data as Record<string, unknown>)
            : {}

        nextData.data = allowedKeys.reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = input[key] ?? null
          return acc
        }, {})

        return nextData
      },
    ],
    afterChange: [
      async ({ context, doc, req }) => {
        if (context?.skipTableRowCountSync) return doc

        const tableID = getTableID(doc.table)
        if (!tableID) return doc

        await syncTableRowCount({ req, tableID })
        return doc
      },
    ],
    afterDelete: [
      async ({ context, doc, req }) => {
        if (context?.skipTableRowCountSync) return doc

        const tableID = getTableID(doc.table)
        if (!tableID) return doc

        await syncTableRowCount({ req, tableID })
        return doc
      },
    ],
  },
  timestamps: true,
}
