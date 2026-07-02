import { APIError } from 'payload'

import type { PayloadSiteConfig } from './types'

const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/

const getEnvSecret = (reference: string) => {
  if (!ENV_NAME_PATTERN.test(reference)) {
    throw new APIError('Payload site API key secret reference must be an environment variable name.', 400)
  }

  const value = process.env[reference]
  if (!value) {
    throw new APIError(`Payload site API key secret "${reference}" is not configured.`, 500)
  }

  return value
}

export const getPayloadAPIKeyAuthHeader = (site: PayloadSiteConfig): string => {
  const authCollection = site.apiKeyAuthCollection?.trim() || 'users'
  const secretReference = site.apiKeySecretReference?.trim()

  if (!secretReference) {
    throw new APIError('Payload site API key secret reference is required.', 400)
  }

  return `${authCollection} API-Key ${getEnvSecret(secretReference)}`
}
