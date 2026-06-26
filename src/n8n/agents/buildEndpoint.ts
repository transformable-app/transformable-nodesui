import { AgentHarnessError } from './types'

const isProduction = process.env.NODE_ENV === 'production'

const assertRelativeEndpointPath = (endpointPath: unknown): string => {
  if (typeof endpointPath !== 'string' || endpointPath.trim().length === 0) {
    throw new AgentHarnessError('input-validation', 'Agent endpoint path is not configured.', 500)
  }

  const path = endpointPath.trim()

  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new AgentHarnessError('input-validation', 'Agent endpoint path must be relative.', 500)
  }

  if (path.includes('..') || path.includes('#')) {
    throw new AgentHarnessError('input-validation', 'Agent endpoint path is not safe.', 500)
  }

  return path
}

export const buildAgentEndpoint = ({
  baseURL,
  endpointPath,
}: {
  baseURL: unknown
  endpointPath: unknown
}): URL => {
  if (typeof baseURL !== 'string' || baseURL.trim().length === 0) {
    throw new AgentHarnessError('input-validation', 'Agent server URL is not configured.', 500)
  }

  const base = new URL(baseURL)

  if (base.username || base.password) {
    throw new AgentHarnessError('input-validation', 'Agent server URL cannot include credentials.', 500)
  }

  if (isProduction && base.protocol !== 'https:') {
    throw new AgentHarnessError('input-validation', 'Agent server URL must use HTTPS in production.', 500)
  }

  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new AgentHarnessError('input-validation', 'Agent server URL protocol is not supported.', 500)
  }

  const endpoint = new URL(assertRelativeEndpointPath(endpointPath), base)

  if (endpoint.origin !== base.origin) {
    throw new AgentHarnessError('input-validation', 'Agent endpoint must stay on the configured server.', 500)
  }

  return endpoint
}
