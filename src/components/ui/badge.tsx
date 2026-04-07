import * as React from 'react'

import { cn } from '@/utilities/ui'

export const badgeVariants = {
  default: 'border-transparent bg-primary text-primary-foreground',
  muted: 'border-border bg-card/70 text-foreground',
  success:
    'border-emerald-500/35 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
  warning:
    'border-amber-500/35 bg-amber-500/20 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100',
  danger:
    'border-rose-500/35 bg-rose-500/20 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-100',
  info:
    'border-sky-500/35 bg-sky-500/20 text-sky-900 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-100',
} as const

type BadgeVariant = keyof typeof badgeVariants

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  )
}
