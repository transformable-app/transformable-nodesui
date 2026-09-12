import type { GlobalConfig } from 'payload'

import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'

export const NotificationSettings: GlobalConfig = {
  slug: 'notification-settings',
  label: 'Notifications',
  admin: { group: 'System', description: 'Thresholds and channel switches for operational alerts.' },
  access: { read: adminAuthenticatedAndNotContentManager, update: adminAuthenticatedAndNotContentManager },
  fields: [
    { name: 'enabled', type: 'checkbox', defaultValue: false },
    {
      name: 'email',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'fromName', type: 'text' },
        { name: 'fromEmail', type: 'email' },
        { name: 'replyTo', type: 'email' },
        {
          name: 'recipients',
          type: 'array',
          fields: [{ name: 'email', type: 'email', required: true }],
          admin: { description: 'Email addresses that receive operational alerts.' },
        },
      ],
    },
    { name: 'ntfyEnabled', type: 'checkbox', defaultValue: false },
    { name: 'failureThreshold', type: 'number', defaultValue: 3, min: 1, max: 100 },
    { name: 'reminderMinutes', type: 'number', defaultValue: 60, min: 5, max: 10080 },
    { name: 'staleSyncMultiplier', type: 'number', defaultValue: 3, min: 1, max: 24 },
    { name: 'ntfyTopic', type: 'text' },
  ],
}
