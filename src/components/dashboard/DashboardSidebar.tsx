'use client'

import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DashboardBrand } from '@/components/dashboard/DashboardBrand'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import type { Header as HeaderType } from '@/payload-types'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { cn } from '@/utilities/ui'

type NavItems = NonNullable<HeaderType['navItems']>

type DashboardSidebarProps = {
  accountLinks?: { href: string; label: string }[]
  logo?: string | null
  lastSyncLabel?: string
  navItems: NavItems
  subtitle?: string | null
  title: string
}

const storageKey = 'dashboard-sidebar-collapsed'

export function DashboardSidebar({
  accountLinks = [],
  lastSyncLabel,
  logo,
  navItems,
  subtitle,
  title,
}: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(storageKey) === 'true')
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col transition-[width] duration-200 lg:flex',
        collapsed ? 'lg:w-[84px]' : 'lg:w-[290px]',
      )}
    >
      <div className="sticky top-6 overflow-hidden rounded-xl border bg-card shadow">
        <div className={cn('border-b p-6', collapsed && 'px-4')}>
          <DashboardBrand collapsed={collapsed} logo={logo} subtitle={subtitle} title={title} />
        </div>

        {!collapsed ? (
          <>
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
              <div className="mb-3 rounded-lg border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Last sync
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {lastSyncLabel || 'Never'}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Color mode</p>
                  <p className="text-xs text-muted-foreground">Light or dark theme</p>
                </div>
                <ThemeSelector />
              </div>
            </div>
          </>
        ) : null}

        <div className={cn('border-t p-4', collapsed && 'px-3')}>
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex w-full items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed ? <span>Collapse</span> : null}
          </button>
        </div>
      </div>
    </aside>
  )
}
