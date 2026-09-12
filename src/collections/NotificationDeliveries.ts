import type { CollectionConfig } from 'payload'

import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'

export const NotificationDeliveries: CollectionConfig = {
  slug: 'notification-deliveries',
  access: {
    create: adminAuthenticatedAndNotContentManager,
    delete: adminAuthenticatedAndNotContentManager,
    read: adminAuthenticatedAndNotContentManager,
    update: adminAuthenticatedAndNotContentManager,
  },
  admin: { group: 'System', defaultColumns: ['channel', 'status', 'createdAt', 'error'] },
  fields: [
    { name: 'incident', type: 'relationship', relationTo: 'notification-incidents', required: true, index: true },
    { name: 'channel', type: 'select', required: true, options: ['email', 'ntfy'] },
    { name: 'status', type: 'select', required: true, options: ['sent', 'failed'] },
    { name: 'error', type: 'textarea' },
    { name: 'metadata', type: 'json' },
  ],
  timestamps: true,
}
