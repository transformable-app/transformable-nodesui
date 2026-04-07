import type { GlobalConfig } from 'payload'

import { defaultLexical } from '@/fields/defaultLexical'
import {
  authenticatedAndNotContentManager,
  publicReadUnlessContentManager,
  userHasRestrictedManagerRole,
} from '@/access/contentManagerRestrictions'

import { revalidateAdmin } from './hooks/revalidateAdmin'

export const Admin: GlobalConfig = {
  slug: 'admin-settings',
  label: 'Admin',
  admin: {
    description: 'Branding and content for the Payload admin panel (icon, login screen).',
    group: 'Settings',
    hidden: ({ user }) => Boolean(user && userHasRestrictedManagerRole(user)),
  },
  access: {
    read: publicReadUnlessContentManager,
    update: authenticatedAndNotContentManager,
  },
  hooks: {
    afterChange: [revalidateAdmin],
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Admin panel icon',
      admin: {
        initCollapsed: false,
        description: 'Icon shown in the top-left of the admin panel (nav bar). Use a square SVG or image for best results.',
      },
      fields: [
        {
          name: 'adminIcon',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description:
              'Upload an SVG or image. If not set, the default Payload icon is used. This image is shown in the admin nav (top-left) and as the browser tab favicon.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Login screen',
      admin: {
        initCollapsed: false,
        description: 'Logo, brand and welcome message shown on the admin login page.',
      },
      fields: [
        {
          name: 'loginLogo',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description: 'Logo shown on the login screen (e.g. full company logo). Separate from the small admin nav icon. If not set, the default Payload logo is used.',
          },
        },
        {
          name: 'loginWelcomeContent',
          type: 'richText',
          editor: defaultLexical,
          admin: {
            description: 'Welcome message or instructions shown above the login form.',
          },
        },
        {
          name: 'allowFrontendCreateAccount',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description: 'Allow visitors to use the frontend create account page and sign-up links.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Dashboard welcome banner',
      admin: {
        initCollapsed: false,
        description: 'Content and colors for the welcome banner on the dashboard.',
      },
      fields: [
        {
          name: 'dashboardBannerExtraContent',
          type: 'richText',
          editor: defaultLexical,
          admin: {
            description: 'Additional content shown below the welcome line, still inside the banner.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Dashboard welcome banner colors',
      admin: {
        initCollapsed: true,
        description:
          'Optional color overrides for the dashboard welcome banner. Leave empty to use the default frontend theme colors. Use hex codes (e.g. #fff7ed).',
      },
      fields: [
        {
          name: 'bannerBg',
          type: 'text',
          admin: { description: 'Background (light mode).' },
        },
        {
          name: 'bannerText',
          type: 'text',
          admin: { description: 'Text color (light mode).' },
        },
        {
          name: 'bannerLink',
          type: 'text',
          admin: { description: 'Link color (light mode).' },
        },
        {
          name: 'bannerBgDark',
          type: 'text',
          admin: { description: 'Background (dark mode).' },
        },
        {
          name: 'bannerTextDark',
          type: 'text',
          admin: { description: 'Text color (dark mode).' },
        },
        {
          name: 'bannerLinkDark',
          type: 'text',
          admin: { description: 'Link color (dark mode).' },
        },
      ],
    },
  ],
}
