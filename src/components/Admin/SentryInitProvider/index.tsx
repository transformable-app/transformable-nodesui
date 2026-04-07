'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Ensures Sentry is initialized in the admin UI (Payload admin bundle may not
 * load the default sentry.client.config). Wrap admin via payload.config providers.
 */
export function SentryInitProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_SENTRY_DSN) return
    try {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        release:
          process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
          `payload@${process.env.npm_package_version ?? '1.0.0'}`,
        integrations: [],
        tracesSampleRate: 0,
      })
    } catch {
      // never break the admin UI
    }
  }, [])

  return <>{children}</>
}
