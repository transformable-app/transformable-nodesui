import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export async function onRequestError(
  error: unknown,
  errorRequest: { path: string; method: string; headers: NodeJS.Dict<string | string[]> },
  errorContext: { routerKind: string; routePath: string; routeType: string },
) {
  Sentry.captureRequestError(error, errorRequest, errorContext)
}
