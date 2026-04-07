import type { CollectionConfig } from 'payload'

import {
  adminAuthenticatedAndNotContentManager,
  userHasContentManagerRole,
} from '../../access/contentManagerRestrictions'
import { authenticated } from '../../access/authenticated'
import { readPublishedDashboards } from '../../access/readPublishedDashboards'
import { checkRole } from '../../access/utilities'
import { ChatEmbedBlock } from '../../blocks/ChatEmbed/config'
import { CredentialsHealthBlock } from '../../blocks/CredentialsHealth/config'
import { DataTableViewerBlock } from '../../blocks/DataTableViewer/config'
import { ExecutionErrorsBlock } from '../../blocks/ExecutionErrors/config'
import { FormBlock } from '../../blocks/FormBlock/config'
import { LatestExecutionsBlock } from '../../blocks/LatestExecutions/config'
import { ServersStatusListBlock } from '../../blocks/ServersStatusList/config'
import { WorkflowsListBlock } from '../../blocks/WorkflowsList/config'
import { slugField } from 'payload'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { ensurePageNavItem } from './hooks/ensurePageNavItem'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  labels: {
    plural: 'Dashboards',
    singular: 'Dashboard',
  },
  access: {
    admin: adminAuthenticatedAndNotContentManager,
    create: authenticated,
    delete: authenticated,
    read: readPublishedDashboards,
    update: authenticated,
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    hidden: ({ user }) => Boolean(user && userHasContentManagerRole(user)),
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'pages',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'requiredRole',
      type: 'relationship',
      relationTo: 'roles',
      admin: {
        description:
          'Optional. When set, only users with this role or the Admin role can view this dashboard on the frontend.',
        position: 'sidebar',
      },
      access: {
        create: ({ req: { user } }) => Boolean(user && checkRole(['Admin'], user)),
        read: ({ req: { user } }) => Boolean(user && checkRole(['Admin'], user)),
        update: ({ req: { user } }) => Boolean(user && checkRole(['Admin'], user)),
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [
                ServersStatusListBlock,
                WorkflowsListBlock,
                CredentialsHealthBlock,
                LatestExecutionsBlock,
                ExecutionErrorsBlock,
                DataTableViewerBlock,
                ChatEmbedBlock,
                FormBlock,
              ],
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    slugField(),
  ],
  hooks: {
    afterChange: [revalidatePage, ensurePageNavItem],
    beforeChange: [populatePublishedAt],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
