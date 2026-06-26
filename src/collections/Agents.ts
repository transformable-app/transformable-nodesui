import type { CollectionConfig, Where } from 'payload'

import { adminAuthenticatedAndNotContentManager } from '@/access/contentManagerRestrictions'
import { checkRole } from '@/access/utilities'

const getRoleID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }

  return null
}

export const Agents: CollectionConfig = {
  slug: 'agents',
  labels: {
    plural: 'Agents',
    singular: 'Agent',
  },
  access: {
    create: adminAuthenticatedAndNotContentManager,
    delete: adminAuthenticatedAndNotContentManager,
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['Admin'], user)) return true

      const roleIDs = Array.isArray(user.roles)
        ? user.roles.map(getRoleID).filter((id): id is string => Boolean(id))
        : []

      if (roleIDs.length === 0) return false

      const constraint: Where = {
        and: [{ enabled: { equals: true } }, { allowedRoles: { in: roleIDs } }],
      }

      return constraint
    },
    update: adminAuthenticatedAndNotContentManager,
  },
  admin: {
    defaultColumns: ['name', 'server', 'workflow', 'transport', 'enabled'],
    useAsTitle: 'name',
  },
  defaultPopulate: {
    enabled: true,
    inputMode: true,
    name: true,
    placeholder: true,
    slug: true,
    streamingEnabled: true,
    transport: true,
    welcomeMessage: true,
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
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
      required: true,
    },
    {
      name: 'server',
      type: 'relationship',
      relationTo: 'servers',
      required: true,
      index: true,
    },
    {
      name: 'workflow',
      type: 'relationship',
      relationTo: 'workflows',
      required: true,
      index: true,
    },
    {
      name: 'transport',
      type: 'select',
      defaultValue: 'webhook',
      options: [
        { label: 'Chat Trigger', value: 'chat-trigger' },
        { label: 'Webhook', value: 'webhook' },
      ],
      required: true,
    },
    {
      name: 'endpointPath',
      type: 'text',
      required: true,
      admin: {
        description: 'Relative production webhook/chat path, for example /webhook/agent. Absolute URLs are rejected.',
      },
    },
    {
      name: 'authStrategy',
      type: 'select',
      defaultValue: 'server-secret',
      options: [
        { label: 'Server Secret', value: 'server-secret' },
        { label: 'Header', value: 'header' },
        { label: 'JWT', value: 'jwt' },
      ],
      required: true,
    },
    {
      name: 'secretReference',
      type: 'text',
      admin: {
        description: 'Environment variable name resolved server-side for n8n invocation auth.',
      },
    },
    {
      name: 'allowedRoles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      admin: {
        description: 'Non-admin users need one of these roles to invoke this agent.',
      },
    },
    {
      name: 'inputMode',
      type: 'select',
      defaultValue: 'chat',
      options: [
        { label: 'Chat', value: 'chat' },
        { label: 'Structured', value: 'structured' },
      ],
      required: true,
    },
    {
      name: 'inputSchema',
      type: 'json',
    },
    {
      name: 'outputSchema',
      type: 'json',
    },
    {
      name: 'streamingEnabled',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'timeoutMS',
      type: 'number',
      defaultValue: 30000,
      min: 1000,
      max: 120000,
      required: true,
    },
    {
      name: 'maxInputBytes',
      type: 'number',
      defaultValue: 20000,
      min: 1,
      max: 200000,
      required: true,
    },
    {
      name: 'welcomeMessage',
      type: 'textarea',
    },
    {
      name: 'placeholder',
      type: 'text',
    },
    {
      name: 'suggestedPrompts',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'capabilities',
      type: 'json',
      admin: {
        description: 'Non-secret capability summary from the selected workflow.',
      },
    },
    {
      name: 'configurationWarning',
      type: 'textarea',
      admin: {
        readOnly: true,
      },
    },
  ],
  timestamps: true,
  versions: {
    maxPerDoc: 50,
  },
}
