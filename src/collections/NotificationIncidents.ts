import type { CollectionConfig } from 'payload'

import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'

export const NotificationIncidents: CollectionConfig = {
  slug: 'notification-incidents',
  access: {
    create: adminAuthenticatedAndNotContentManager,
    delete: adminAuthenticatedAndNotContentManager,
    read: adminAuthenticatedAndNotContentManager,
    update: adminAuthenticatedAndNotContentManager,
  },
  admin: { group: 'System', defaultColumns: ['source', 'severity', 'status', 'count', 'lastSeenAt'] },
  fields: [
    { name: 'fingerprint', type: 'text', required: true, unique: true, index: true },
    { name: 'source', type: 'text', required: true, index: true },
    { name: 'severity', type: 'select', required: true, options: ['critical', 'warning', 'info'] },
    { name: 'status', type: 'select', required: true, defaultValue: 'open', options: ['open', 'resolved'], index: true },
    { name: 'count', type: 'number', required: true, defaultValue: 0 },
    { name: 'firstSeenAt', type: 'date', required: true },
    { name: 'lastSeenAt', type: 'date', required: true },
    { name: 'lastAlertedAt', type: 'date' },
    { name: 'summary', type: 'textarea' },
    { name: 'metadata', type: 'json' },
  ],
  timestamps: true,
}
