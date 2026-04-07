import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release:
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    `payload@${process.env.npm_package_version ?? '1.0.0'}`,
  integrations: [],
  tracesSampleRate: 0,
})
