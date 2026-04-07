import type { ReactNode } from 'react'

import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { RenderParams } from '@/components/RenderParams'
import { AccountNav } from '@/components/AccountNav'
import { CMSLink } from '@/components/Link'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { DashboardBrand } from '@/components/dashboard/DashboardBrand'
import { getCachedGlobal } from '@/utilities/getGlobals'
import type { Header as HeaderType } from '@/payload-types'
import { getMediaUrl } from '@/utilities/getMediaUrl'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/utilities/ui'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const [{ user }, headerDataResult] = await Promise.all([
    payload.auth({ headers }),
    getCachedGlobal('header', 1)(),
  ])
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

  return (
    <article className="pb-8 pt-4 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="container">
          <RenderParams className="" />
        </div>

        <div className={cn('flex flex-col gap-6', user && !hideDashboardSidebar && 'lg:flex-row')}>
          {user && !hideDashboardSidebar ? (
            <aside className="hidden lg:flex lg:w-[290px] lg:shrink-0 lg:flex-col">
              <div className="sticky top-6 overflow-hidden rounded-xl border bg-card shadow">
                <div className="border-b p-6">
                  <DashboardBrand logo={logo} subtitle={sidebarText} title={sidebarLabel} />
                </div>

                <div className="p-4">
                  <nav className="flex flex-col gap-1">
                    {navItems.map(({ link }, index) =>
                      link ? (
                        <CMSLink
                          key={`${link.label || 'account-nav'}-${index}`}
                          {...link}
                          appearance="inline"
                          className="group flex items-center justify-between rounded-lg border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          <span className="text-muted-foreground transition group-hover:text-primary">
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </CMSLink>
                      ) : null,
                    )}
                  </nav>
                </div>

                <div className="border-t p-4">
                  <AccountNav />
                </div>

                <div className="border-t p-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Color mode</p>
                      <p className="text-xs text-muted-foreground">Light or dark theme</p>
                    </div>
                    <ThemeSelector />
                  </div>
                </div>
              </div>
            </aside>
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
