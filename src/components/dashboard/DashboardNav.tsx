'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

import { CMSLink, getCMSLinkHref } from '@/components/Link'
import type { Header as HeaderType } from '@/payload-types'
import { cn } from '@/utilities/ui'

type NavItems = NonNullable<HeaderType['navItems']>

const normalizePath = (value?: string | null): string => {
  if (!value) return ''
  if (value === '/') return '/'

  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function DashboardNav({
  navItems,
  accountLinks,
  mobile = false,
}: {
  navItems: NavItems
  accountLinks: { href: string; label: string }[]
  mobile?: boolean
}) {
  const pathname = usePathname()
  const currentPath = normalizePath(pathname)
  const itemClassName = mobile
    ? 'snap-start whitespace-nowrap rounded-lg border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent'
    : 'group flex items-center justify-between rounded-lg border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground'
  const activeClassName = mobile
    ? 'border-border bg-accent text-foreground'
    : 'border-border bg-accent text-foreground'

  return (
    <>
      {navItems.map(({ link }, index) => {
        if (!link) return null

        const href = normalizePath(
          getCMSLinkHref({
            reference: link.reference,
            type: link.type,
            url: link.url,
          }),
        )
        const isActive = Boolean(href) && href === currentPath

        return (
          <CMSLink
            key={`${link.label || (mobile ? 'mobile-nav' : 'nav')}-${index}`}
            {...link}
            appearance="inline"
            className={cn(itemClassName, isActive && activeClassName)}
          >
            {!mobile ? (
              <span className="text-muted-foreground transition group-hover:text-primary">
                <ArrowRight className="h-4 w-4" />
              </span>
            ) : null}
          </CMSLink>
        )
      })}
      {accountLinks.map((link) => {
        const isActive = normalizePath(link.href) === currentPath

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(itemClassName, isActive && activeClassName)}
          >
            <span>{link.label}</span>
            {!mobile ? (
              <span className="text-muted-foreground transition group-hover:text-primary">
                <ArrowRight className="h-4 w-4" />
              </span>
            ) : null}
          </Link>
        )
      })}
    </>
  )
}
