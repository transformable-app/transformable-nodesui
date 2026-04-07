import type { Block } from 'payload'

export const DataTableViewerBlock: Block = {
  slug: 'dataTableViewer',
  interfaceName: 'DataTableViewerBlock',
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Data table',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'table',
      type: 'relationship',
      relationTo: 'data-tables',
      required: true,
    },
    {
      name: 'pagingMode',
      type: 'select',
      defaultValue: 'pagination',
      options: [
        {
          label: 'Preview first page only',
          value: 'preview',
        },
        {
          label: 'Paged navigation',
          value: 'pagination',
        },
      ],
      required: true,
    },
    {
      name: 'defaultSort',
      type: 'select',
      defaultValue: 'createdUpdatedDesc',
      options: [
        {
          label: 'Created date, then updated date (newest first)',
          value: 'createdUpdatedDesc',
        },
        {
          label: 'Updated date, then created date (newest first)',
          value: 'updatedCreatedDesc',
        },
        {
          label: 'Remote created date (newest first)',
          value: 'remoteCreatedDesc',
        },
        {
          label: 'Remote updated date (newest first)',
          value: 'remoteUpdatedDesc',
        },
        {
          label: 'Row index (lowest first)',
          value: 'rowIndexAsc',
        },
        {
          label: 'Row index (highest first)',
          value: 'rowIndexDesc',
        },
      ],
      required: true,
    },
    {
      name: 'pageSize',
      type: 'number',
      defaultValue: 10,
      admin: {
        step: 5,
      },
      max: 100,
      min: 5,
      required: true,
    },
  ],
}
