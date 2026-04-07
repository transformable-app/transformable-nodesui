import Link from 'next/link'
import React from 'react'
import { LayoutDashboard } from 'lucide-react'

type DashboardBrandProps = {
  href?: string
  logo?: string | null
  title: string
  subtitle?: string | null
  compact?: boolean
}

export function DashboardBrand({
  href = '/',
  logo,
  title,
  subtitle,
  compact = false,
}: DashboardBrandProps) {
  const iconSizeClass = compact ? 'h-10 w-10' : 'h-12 w-12'
  const imageSizeClass = compact ? 'h-7 w-7' : 'h-8 w-8'

  return (
    <Link className="flex min-w-0 items-center gap-3" href={href}>
      <div
        className={`flex ${iconSizeClass} shrink-0 items-center justify-center rounded-lg border bg-background text-foreground`}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={title} className={`${imageSizeClass} object-contain`} src={logo} />
        ) : (
          <LayoutDashboard className="h-5 w-5 text-primary" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
