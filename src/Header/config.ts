import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import {
  authenticatedAndNotContentManager,
  publicReadUnlessContentManager,
  userHasRestrictedManagerRole,
} from '@/access/contentManagerRestrictions'
import { revalidateHeader } from './hooks/revalidateHeader'

export const Header: GlobalConfig = {
  label: 'Sidebar',
  slug: 'header',
  admin: {
    hidden: ({ user }) => Boolean(user && userHasRestrictedManagerRole(user)),
  },
  access: {
    read: publicReadUnlessContentManager,
    update: authenticatedAndNotContentManager,
  },
  fields: [
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Logo displayed in the header. If not set, no logo will be shown.',
      },
    },
    {
      name: 'favicon',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Favicon (.ico file). If not set, the default favicon.ico will be used.',
      },
    },
    {
      name: 'appleTouchIcon',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Apple touch icon (typically 180x180 PNG). If not set, no apple touch icon will be used.',
      },
    },
    {
      name: 'headerScripts',
      type: 'code',
      admin: {
        description: 'Custom scripts to include in the <head> section (e.g., analytics, tracking codes).',
        language: 'html',
      },
    },
    {
      name: 'metaTags',
      type: 'code',
      admin: {
        description: 'Meta tags to include in the <head> section (e.g., Google verification, Bing verification).',
        language: 'html',
      },
    },
    {
      name: 'dashboardSidebarLabel',
      type: 'text',
      defaultValue: 'Dash',
      admin: {
        description: 'Short title shown in the dashboard sidebar brand area.',
      },
    },
    {
      name: 'dashboardSidebarText',
      type: 'text',
      defaultValue: 'Configurable header nav',
      admin: {
        description: 'Supporting text shown beneath the dashboard sidebar title.',
      },
    },
    {
      name: 'hideDashboardSidebar',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Hide the desktop dashboard sidebar while keeping the page content visible.',
      },
    },
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/Header/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
