import type { Metadata } from 'next'

import { DashboardPageShell } from '@/components/dashboard/PageShell'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode, headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import React, { cache } from 'react'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { canReadDashboard } from '@/utilities/canReadDashboard'
import { generateMeta } from '@/utilities/generateMeta'
import PageClient from './page.client'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import type { Header as HeaderType } from '@/payload-types'
import { getCachedGlobal } from '@/utilities/getGlobals'

const getLoginRedirect = (path: string) =>
  `/login?warning=${encodeURIComponent('Please login to view this dashboard.')}&redirect=${encodeURIComponent(path)}`

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const pages = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  })

  const params = pages.docs
    ?.filter((doc) => {
      return doc.slug !== 'home'
    })
    .map(({ slug }) => {
      return { slug }
    })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ params: paramsPromise, searchParams: searchParamsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = 'home' } = await paramsPromise
  const searchParams = await searchParamsPromise
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const url = '/' + decodedSlug
  const [page, headerDataResult] = await Promise.all([
    queryPageBySlug({
      slug: decodedSlug,
    }),
    getCachedGlobal('header', 1)(),
  ])
  const headerData = headerDataResult as HeaderType

  if (!page) {
    redirect(getLoginRedirect(url))
  }

  const dashboard = page as typeof page & { description?: string | null }
  const { layout, title } = page
  const description = dashboard.description
  const navItems = (headerData.navItems || []).filter((item): item is NonNullable<typeof item> =>
    Boolean(item?.link),
  )

  return (
    <DashboardPageShell
      headerData={headerData}
      navItems={navItems}
    >
      <PageClient />
      {draft && <LivePreviewListener />}

      <section className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card p-8 shadow sm:p-10">
          <div className="max-w-4xl space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            {description ? <p className="text-lg leading-8 text-muted-foreground">{description}</p> : null}
          </div>
        </section>

        <div className="rounded-xl border bg-card p-4 shadow sm:p-6">
          <RenderBlocks blocks={layout} searchParams={searchParams} />
        </div>
      </section>
    </DashboardPageShell>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = 'home' } = await paramsPromise
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const page = await queryPageBySlug({
    slug: decodedSlug,
  })

  return generateMeta({ doc: page })
}

const queryPageBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const payload = await getPayload({ config: configPromise })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })

  const result = await payload.find({
    collection: 'pages',
    depth: 3,
    draft,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    where: {
      and: [
        {
          slug: {
            equals: slug,
          },
        },
        ...(draft
          ? []
          : [
              {
                _status: {
                  equals: 'published',
                },
              },
            ]),
      ],
    },
  })

  const page = result.docs?.[0] || null
  if (!page) return null
  if (draft) return page

  return canReadDashboard({ page, user }) ? page : null
})
