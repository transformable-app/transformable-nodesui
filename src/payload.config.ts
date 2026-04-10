import { mongooseAdapter } from '@payloadcms/db-mongodb'
import sharp from 'sharp'
import path from 'path'
import { APIError, buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Credentials } from './collections/Credentials'
import { DataTables } from './collections/DataTables'
import { DataTableRows } from './collections/DataTableRows'
import { Executions } from './collections/Executions'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Roles } from './collections/Roles'
import { Servers } from './collections/Servers'
import { Users } from './collections/Users'
import { Workflows } from './collections/Workflows'
import { Admin } from './Admin/config'
import { Header } from './Header/config'
import { Jobs } from './JobsGlobal/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'
import { n8nSyncEndpoints } from './endpoints/n8nSync'
import { ensureDashNavItem } from './endpoints/seed/ensure-dash-nav-item'
import { issueForm } from './endpoints/seed/issue-form'
import { yourAutomationsDash } from './endpoints/seed/your-automations-dash'
import { tasks } from './jobs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const requiredRoles = ['Admin', 'User'] as const
const jobsAutoRunEnabled = process.env.PAYLOAD_JOBS_AUTORUN === 'true'
const jobsAutoRunCron = process.env.PAYLOAD_JOBS_AUTORUN_CRON || '* * * * *'

export default buildConfig({
  admin: {
    meta: {
      icons: [
        { rel: 'icon', url: '/admin-favicon' },
      ],
    },
    components: {
      actions: ['@/components/Admin/GitHubAction'],
      graphics: {
        Icon: '@/components/AdminIcon',
        Logo: '@/components/AdminLogo',
      },
      providers: [
        '@/components/AdminSettingsRefresh#AdminSettingsRefreshProvider',
        '@/components/Admin/SentryInitProvider#SentryInitProvider',
      ],
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      beforeLogin: ['@/components/BeforeLogin'],
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    // Ensures dashboard collection cards show and import map includes the widget
    dashboard: {
      defaultLayout: [{ widgetSlug: 'collections', width: 'full' }],
      widgets: [
        {
          slug: 'collections',
          Component: '@payloadcms/next/rsc#CollectionCards',
          minWidth: 'full',
        },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
  }),
  collections: [
    Pages,
    Media,
    Servers,
    Workflows,
    Credentials,
    Executions,
    DataTables,
    DataTableRows,
    Roles,
    Users,
  ],
  cors: [
    getServerSideURL(),
    'https://payloadcms.3twenty9.com',
  ].filter((url): url is string => Boolean(url) && typeof url === 'string'),
  folders: {
    browseByFolder: false,
  },
  endpoints: [
    ...n8nSyncEndpoints,
    {
      path: '/jobs/reset',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          throw new APIError('Unauthorized', 401)
        }

        await req.payload.delete({
          collection: 'payload-jobs',
          where: { id: { exists: true } },
          overrideAccess: false,
          req,
        })

        await req.payload.updateGlobal({
          slug: 'payload-jobs-stats',
          data: {
            stats: {},
          },
          overrideAccess: false,
          req,
        })

        return Response.json({ ok: true })
      },
    },
  ],
  globals: [Admin, Jobs, Header],
  plugins,
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  onInit: async (payload) => {
    for (const name of requiredRoles) {
      const existingRole = await payload.find({
        collection: 'roles',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          name: {
            equals: name,
          },
        },
      })

      if (existingRole.totalDocs === 0) {
        await payload.create({
          collection: 'roles',
          data: { name },
          overrideAccess: true,
        })
      }
    }

    const existingDashboards = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })

    if (existingDashboards.totalDocs === 0) {
      const existingIssueForm = await payload.find({
        collection: 'forms',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          title: {
            equals: issueForm.title,
          },
        },
      })

      const form =
        existingIssueForm.docs[0] ??
        (await payload.create({
          collection: 'forms',
          data: issueForm,
          overrideAccess: true,
        }))

      const page = await payload.create({
        collection: 'pages',
        data: yourAutomationsDash({ issueForm: form }),
        context: {
          skipNavItemSync: true,
        },
        overrideAccess: true,
      })

      await ensureDashNavItem({ dash: page, payload })
    }
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${process.env.CRON_SECRET}`
      },
    },
    autoRun: jobsAutoRunEnabled
      ? [
          {
            allQueues: true,
            cron: jobsAutoRunCron,
          },
        ]
      : undefined,
    tasks,
  },
})
