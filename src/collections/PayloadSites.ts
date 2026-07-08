import type { Access, CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { checkRole } from '@/access/utilities'
import { payloadSiteCollectionEndpoints } from '@/endpoints/payloadSites'
import type { User } from '@/payload-types'

const adminOnly: Access = ({ req: { user } }) => checkRole(['Admin'], user as User | null | undefined)
const adminFieldAccess = ({ req }: { req: { user?: unknown } }) =>
  checkRole(['Admin'], req.user as User | null | undefined)

export const PayloadSites: CollectionConfig = {
  slug: 'payload-sites',
  endpoints: payloadSiteCollectionEndpoints,
  labels: {
    plural: 'Payload Sites',
    singular: 'Payload Site',
  },
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: authenticated,
    update: adminOnly,
  },
  admin: {
    defaultColumns: [
      'name',
      'baseURL',
      'companionPluginStatus',
      'schemaProfileStatus',
      'writeBackEnabled',
    ],
    useAsTitle: 'name',
  },
  defaultPopulate: {
    baseURL: true,
    companionPluginStatus: true,
    name: true,
    schemaProfileHash: true,
    schemaProfileStatus: true,
    slug: true,
    writeBackEnabled: true,
  },
  fields: [
    {
      name: 'siteActions',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/Admin/PayloadSiteActions#PayloadSiteActionsField',
        },
        position: 'sidebar',
      },
    },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      required: true,
    },
    {
      name: 'writeBackEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Only enable after the companion plugin is connected and the synced schema profile has been reviewed.',
      },
    },
    {
      name: 'baseURL',
      type: 'text',
      label: 'Base URL',
      required: true,
      admin: {
        description: 'Trusted origin for the target Payload site, for example https://cms.example.com.',
      },
    },
    {
      name: 'adminURL',
      type: 'text',
      label: 'Admin URL',
      admin: {
        description: 'Optional editor/admin URL root used for review links.',
      },
    },
    {
      name: 'apiKeyAuthCollection',
      type: 'text',
      defaultValue: 'users',
      required: true,
      admin: {
        description: 'Auth collection slug used in Payload API key auth headers.',
      },
    },
    {
      name: 'apiKeySecretReference',
      type: 'text',
      required: true,
      access: {
        read: adminFieldAccess,
        update: adminFieldAccess,
      },
      admin: {
        components: {
          Field: '@/components/Admin/SecretTextField#SecretTextField',
        },
        description: 'Environment variable name containing the target Payload API key.',
      },
    },
    {
      name: 'n8nReadAPIKeySecretReference',
      type: 'text',
      access: {
        read: adminFieldAccess,
        update: adminFieldAccess,
      },
      admin: {
        components: {
          Field: '@/components/Admin/SecretTextField#SecretTextField',
        },
        description:
          'Optional n8n credential name or secret reference for a separate read-only Payload API key on this target site.',
      },
    },
    {
      name: 'schemaProfileEndpoint',
      type: 'text',
      defaultValue: '/api/nodesui/schema-profile',
      required: true,
    },
    {
      name: 'companionPluginStatus',
      type: 'select',
      defaultValue: 'missing',
      options: ['missing', 'connected', 'stale', 'error'],
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'companionPluginLastCheckedAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'companionPluginError',
      type: 'textarea',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'schemaProfileStatus',
      type: 'select',
      defaultValue: 'missing',
      options: ['missing', 'synced', 'stale', 'error'],
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'schemaProfileSyncedAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'schemaProfileHash',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'schemaProfileReviewedAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'schemaProfileReviewedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'schemaProfile',
      type: 'json',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'capabilities',
      type: 'json',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'allowedCollections',
      type: 'text',
      hasMany: true,
      defaultValue: ['pages', 'media'],
      required: true,
      admin: {
        description: 'Writable target-site collections. Generated output is still validated against the schema profile.',
      },
    },
    {
      name: 'readableCollections',
      type: 'text',
      hasMany: true,
      defaultValue: ['pages', 'posts', 'media'],
      admin: {
        description:
          'Target-site collections that n8n agents may read directly with a scoped read-only Payload API key.',
      },
    },
    {
      name: 'allowedRoles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      admin: {
        description: 'NodesUI roles allowed to generate drafts for this site.',
      },
    },
    {
      name: 'fieldAllowlists',
      type: 'array',
      fields: [
        { name: 'collection', type: 'text', required: true },
        {
          name: 'paths',
          type: 'text',
          hasMany: true,
          required: true,
        },
      ],
    },
    {
      name: 'mediaPolicy',
      type: 'group',
      fields: [
        {
          name: 'allowedMimeTypes',
          type: 'text',
          hasMany: true,
          defaultValue: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        },
        {
          name: 'maxFileSizeBytes',
          type: 'number',
          defaultValue: 10_485_760,
          min: 1,
          required: true,
        },
      ],
    },
  ],
  timestamps: true,
}
