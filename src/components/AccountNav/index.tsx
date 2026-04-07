'use client'

import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  className?: string
  itemClassName?: string
  activeItemClassName?: string
  mobile?: boolean
}

export const AccountNav: React.FC<Props> = ({
  className,
  itemClassName,
  activeItemClassName,
  mobile = false,
}) => {
  const pathname = usePathname()
  const baseItemClassName =
    itemClassName ||
    'group flex items-center justify-between rounded-lg border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground'
  const activeClassName =
    activeItemClassName || 'border-border bg-accent text-foreground'
  const links = [
    { href: '/account', label: 'Account' },
    { href: '/logout', label: 'Log out' },
  ]

  if (mobile) {
    return (
      <>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(baseItemClassName, {
              [activeClassName]: pathname === link.href,
            })}
          >
            <span>{link.label}</span>
          </Link>
        ))}
      </>
    )
  }

  return (
    <nav className={clsx(className)}>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={clsx(baseItemClassName, {
                [activeClassName]: pathname === link.href,
              })}
            >
              <span>{link.label}</span>
              <span className="text-muted-foreground transition group-hover:text-primary">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
