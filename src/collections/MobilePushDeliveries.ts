import type { CollectionConfig } from 'payload'

import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'

/** Durable per-device Expo delivery ledger. A record is created before any network request. */
export const MobilePushDeliveries: CollectionConfig = {
  slug: 'mobile-push-deliveries',
  access: {
    create: adminAuthenticatedAndNotContentManager,
    delete: adminAuthenticatedAndNotContentManager,
    read: adminAuthenticatedAndNotContentManager,
    update: adminAuthenticatedAndNotContentManager,
  },
  admin: { group: 'System', defaultColumns: ['eventKey', 'status', 'attempts', 'nextAttemptAt'] },
  fields: [
    { name: 'eventKey', type: 'text', required: true, unique: true, index: true },
    { name: 'server', type: 'relationship', relationTo: 'servers', required: true, index: true },
    {
      name: 'execution',
      type: 'relationship',
      relationTo: 'executions',
      required: true,
      index: true,
    },
    {
      name: 'device',
      type: 'relationship',
      relationTo: 'mobile-devices',
      required: true,
      index: true,
    },
    { name: 'recipient', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'groupKey', type: 'text', required: true, index: true },
    { name: 'notification', type: 'json', required: true },
    { name: 'display', type: 'json', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: ['pending', 'ticketed', 'sent', 'failed'],
    },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0 },
    { name: 'nextAttemptAt', type: 'date', index: true },
    { name: 'ticketID', type: 'text', index: true },
    { name: 'lastAttemptAt', type: 'date' },
    { name: 'error', type: 'text' },
    { name: 'receiptStatus', type: 'text' },
  ],
  timestamps: true,
}
