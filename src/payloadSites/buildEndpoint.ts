import { APIError } from 'payload'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

const normalizeRelativePath = (path: string) => {
  const trimmed = path.trim()
  if (!trimmed) return '/api/nodesui/schema-profile'
  if (/^https?:\/\//i.test(trimmed)) {
    throw new APIError('Payload site API paths must be relative.', 400)
  }
  if (trimmed.includes('..') || trimmed.includes('#')) {
    throw new APIError('Payload site API path is invalid.', 400)
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export const buildPayloadSiteEndpoint = ({
  baseURL,
  path,
}: {
  baseURL?: string | null
  path: string
}) => {
  if (!baseURL?.trim()) throw new APIError('Payload site base URL is required.', 400)

  const base = new URL(baseURL)
  if (base.username || base.password || base.hash) {
    throw new APIError('Payload site base URL must not include credentials or fragments.', 400)
  }

  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction && base.protocol !== 'https:') {
    throw new APIError('Payload site base URL must use HTTPS in production.', 400)
  }

  if (isProduction && LOCAL_HOSTS.has(base.hostname.toLowerCase())) {
    throw new APIError('Payload site base URL must not target a local host in production.', 400)
  }

  return new URL(normalizeRelativePath(path), base).toString()
}
