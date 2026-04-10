import type { Metadata } from 'next'

import React, { cache } from 'react'
import { draftMode, headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { DashboardPageShell } from '@/components/dashboard/PageShell'
import type { Header as HeaderType } from '@/payload-types'
import configPromise from '@payload-config'
import { generateMeta } from '@/utilities/generateMeta'
import { canReadDashboard } from '@/utilities/canReadDashboard'
import { getCachedGlobal } from '@/utilities/getGlobals'

import PageClient from './[slug]/page.client'

export const dynamic = 'force-dynamic'

type HomePageArgs = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const getLoginRedirect = (path: string) =>
  `/login?warning=${encodeURIComponent('Please login to view this dashboard.')}&redirect=${encodeURIComponent(path)}`

export default async function HomePage({ searchParams: searchParamsPromise }: HomePageArgs) {
  const { isEnabled: draft } = await draftMode()
  const searchParams = await searchParamsPromise
  const [page, headerDataResult] = await Promise.all([queryHomePage(), getCachedGlobal('header', 1)()])
  const headerData = headerDataResult as HeaderType

  if (!page) {
    redirect(getLoginRedirect('/'))
  }

  const dashboard = page as typeof page & { description?: string | null }
  const navItems = (headerData.navItems || []).filter((item): item is NonNullable<typeof item> =>
    Boolean(item?.link),
  )
  const { layout, title } = page
  const description = dashboard.description

  return (
    <DashboardPageShell
      headerData={headerData}
      navItems={navItems}
    >
      <PageClient />
      {draft ? <LivePreviewListener /> : null}

      <section className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card p-8 shadow sm:p-10">
          <div className="max-w-4xl space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
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

export async function generateMetadata(): Promise<Metadata> {
  const page = await queryHomePage()

  return generateMeta({ doc: page })
}

const queryHomePage = cache(async () => {
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
            equals: 'home',
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
