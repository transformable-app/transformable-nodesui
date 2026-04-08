import type { ReactNode } from 'react'

import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { RenderParams } from '@/components/RenderParams'
import { AccountNav } from '@/components/AccountNav'
import { CMSLink } from '@/components/Link'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { DashboardBrand } from '@/components/dashboard/DashboardBrand'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { getLatestSyncAt } from '@/components/dashboard/getLatestSyncAt'
import { getCachedGlobal } from '@/utilities/getGlobals'
import type { Header as HeaderType } from '@/payload-types'
import { getMediaUrl } from '@/utilities/getMediaUrl'
import { cn } from '@/utilities/ui'
import { formatDateTime } from '@/n8n/format'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const [{ user }, headerDataResult] = await Promise.all([
    payload.auth({ headers }),
    getCachedGlobal('header', 1)(),
  ])
  const lastSyncAt = await getLatestSyncAt({ payload, user })
  const headerData = headerDataResult as HeaderType
  const logo =
    headerData?.logo && typeof headerData.logo === 'object' && 'url' in headerData.logo
      ? getMediaUrl(headerData.logo.url as string)
      : null
  const sidebarLabel = headerData.dashboardSidebarLabel || 'Dash'
  const sidebarText = headerData.dashboardSidebarText || 'Configurable header nav'
  const hideDashboardSidebar = headerData.hideDashboardSidebar === true
  const navItems = (headerData.navItems || []).filter((item): item is NonNullable<typeof item> =>
    Boolean(item?.link),
  )
  const accountLinks = [
    { href: '/account', label: 'Account' },
    { href: '/logout', label: 'Log out' },
  ]

  return (
    <article className="pb-8 pt-4 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="container">
          <RenderParams className="" />
        </div>

        <div className={cn('flex flex-col gap-6', user && !hideDashboardSidebar && 'lg:flex-row')}>
          {user && !hideDashboardSidebar ? (
            <DashboardSidebar
              accountLinks={accountLinks}
              lastSyncLabel={formatDateTime(lastSyncAt)}
              logo={logo}
              navItems={navItems}
              subtitle={sidebarText}
              title={sidebarLabel}
            />
          ) : null}

          <div className="min-w-0 flex-1 space-y-6 lg:-mt-6">
            {user ? (
              <div className="rounded-xl border bg-card shadow lg:hidden">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <DashboardBrand
                      compact
                      logo={logo}
                      subtitle={sidebarText}
                      title={sidebarLabel}
                    />
                  </div>
                  <div className="flex items-center">
                    <div className="rounded-lg border bg-background px-2 py-1">
                      <ThemeSelector />
                    </div>
                  </div>
                </div>

                <div className="border-t bg-muted/35 p-4">
                  <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                    {navItems.map(({ link }, index) =>
                      link ? (
                        <CMSLink
                          key={`${link.label || 'account-mobile-nav'}-${index}`}
                          {...link}
                          appearance="inline"
                          className="snap-start whitespace-nowrap rounded-lg border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
                        />
                      ) : null,
                    )}
                    <AccountNav
                      itemClassName="snap-start whitespace-nowrap rounded-lg border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
                      activeItemClassName="border-border bg-accent text-foreground"
                      mobile
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-12">{children}</div>
          </div>
        </div>
      </div>
    </article>
  )
}
