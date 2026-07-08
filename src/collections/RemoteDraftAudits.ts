import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/utilities'

export const RemoteDraftAudits: CollectionConfig = {
  slug: 'remote-draft-audits',
  labels: {
    plural: 'Remote Draft Audits',
    singular: 'Remote Draft Audit',
  },
  access: {
    create: ({ req: { user } }) => checkRole(['Admin'], user),
    delete: () => false,
    read: ({ req: { user } }) => checkRole(['Admin'], user),
    update: () => false,
  },
  admin: {
    defaultColumns: ['payloadSite', 'collection', 'operation', 'status', 'run', 'attemptedAt'],
    useAsTitle: 'id',
  },
  fields: [
    { name: 'run', type: 'relationship', relationTo: 'agent-runs', index: true },
    { name: 'plan', type: 'relationship', relationTo: 'agent-plans', index: true },
    { name: 'planTask', type: 'relationship', relationTo: 'agent-plan-tasks', index: true },
    { name: 'payloadSite', type: 'relationship', relationTo: 'payload-sites', index: true },
    { name: 'collection', type: 'text', index: true },
    { name: 'operation', type: 'select', options: ['create', 'update', 'publish'] },
    { name: 'status', type: 'select', options: ['attempted', 'succeeded', 'failed'], required: true },
    { name: 'remoteDocumentID', type: 'text' },
    { name: 'remoteVersionID', type: 'text' },
    { name: 'adminURL', type: 'text' },
    { name: 'previewURL', type: 'text' },
    { name: 'mediaIDs', type: 'json' },
    { name: 'target', type: 'json' },
    { name: 'outputBinding', type: 'json' },
    { name: 'requestDocument', type: 'json' },
    { name: 'response', type: 'json' },
    { name: 'error', type: 'textarea' },
    { name: 'attemptedAt', type: 'date', required: true },
    { name: 'completedAt', type: 'date' },
  ],
  timestamps: true,
}
