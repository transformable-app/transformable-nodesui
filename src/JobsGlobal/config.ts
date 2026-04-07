import type { GlobalConfig } from 'payload'

import {
  authenticatedAndNotContentManager,
  userHasRestrictedManagerRole,
} from '@/access/contentManagerRestrictions'

export const Jobs: GlobalConfig = {
  slug: 'jobs',
  label: 'Jobs',
  admin: {
    group: 'Settings',
    hidden: ({ user }) => Boolean(user && userHasRestrictedManagerRole(user)),
    components: {
      views: {
        edit: {
          default: {
            Component: '@/components/Admin/JobsScheduleView',
          },
        },
      },
    },
  },
  access: {
    read: authenticatedAndNotContentManager,
    update: authenticatedAndNotContentManager,
  },
  fields: [],
}
