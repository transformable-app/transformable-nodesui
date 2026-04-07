import React from 'react'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { DashboardBrand } from '@/components/dashboard/DashboardBrand'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import type { Header as HeaderType } from '@/payload-types'
import { getMediaUrl } from '@/utilities/getMediaUrl'
import { cn } from '@/utilities/ui'

type NavItems = NonNullable<HeaderType['navItems']>

export async function DashboardPageShell({
  children,
  headerData,
  navItems,
}: {
  children: React.ReactNode
  headerData: HeaderType
  navItems: NavItems
}) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })
  const logo =
    headerData?.logo && typeof headerData.logo === 'object' && 'url' in headerData.logo
      ? getMediaUrl(headerData.logo.url as string)
      : null
  const sidebarLabel = headerData.dashboardSidebarLabel || 'Dash'
  const sidebarText = headerData.dashboardSidebarText || 'Configurable header nav'
  const hideDashboardSidebar = headerData.hideDashboardSidebar === true
  const accountLinks = user
    ? [
        { href: '/account', label: 'Account' },
        { href: '/logout', label: 'Log out' },
      ]
    : []

  return (
    <article className="pb-8 pt-4 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className={cn('flex flex-col gap-6', !hideDashboardSidebar && 'lg:flex-row')}>
          {!hideDashboardSidebar ? (
            <aside className="hidden lg:flex lg:w-[290px] lg:shrink-0 lg:flex-col">
              <div className="sticky top-6 overflow-hidden rounded-xl border bg-card shadow">
                <div className="border-b p-6">
                  <DashboardBrand logo={logo} subtitle={sidebarText} title={sidebarLabel} />
                </div>

                <nav className="flex flex-col gap-1 p-4">
                  <DashboardNav accountLinks={[]} navItems={navItems} />
                  {accountLinks.length > 0 ? (
                    <>
                      <div className="my-2 border-t" />
                      <DashboardNav accountLinks={accountLinks} navItems={[]} />
                    </>
                  ) : null}
                </nav>

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
            <div className="rounded-xl border bg-card shadow lg:hidden">
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <DashboardBrand compact logo={logo} subtitle={sidebarText} title={sidebarLabel} />
                </div>
                <div className="flex items-center">
                  <div className="rounded-lg border bg-background px-2 py-1">
                    <ThemeSelector />
                  </div>
                </div>
              </div>

              <div className="border-t bg-muted/35 p-4">
                <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                  <DashboardNav accountLinks={accountLinks} mobile navItems={navItems} />
                </div>
              </div>
            </div>

            {children}
          </div>
        </div>
      </div>
    </article>
  )
}
