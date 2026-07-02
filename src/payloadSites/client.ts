import { APIError } from 'payload'

import { getPayloadAPIKeyAuthHeader } from './auth'
import { buildPayloadSiteEndpoint } from './buildEndpoint'
import { validateSchemaProfile } from './schemaProfile'
import type { PayloadSiteConfig } from './types'

const readJSON = async (response: Response) => {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new APIError('Payload site response was not valid JSON.', 502)
  }
}

export const fetchSchemaProfile = async (site: PayloadSiteConfig) => {
  const endpoint = buildPayloadSiteEndpoint({
    baseURL: site.baseURL,
    path: site.schemaProfileEndpoint || '/api/nodesui/schema-profile',
  })

  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/json',
      authorization: getPayloadAPIKeyAuthHeader(site),
    },
    method: 'GET',
  })

  const body = await readJSON(response)

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Payload site schema profile request failed with ${response.status}.`
    throw new APIError(message, response.status)
  }

  const profile =
    body && typeof body === 'object' && 'schemaProfile' in body
      ? (body as { schemaProfile?: unknown }).schemaProfile
      : body

  const validation = validateSchemaProfile(profile)
  if (!validation.ok) {
    throw new APIError(validation.errors.join(' '), 502)
  }

  return validation
}

export const writeDraftDocument = async ({
  collection,
  data,
  id,
  operation,
  site,
}: {
  collection: string
  data: Record<string, unknown>
  id?: string
  operation: 'create' | 'update'
  site: PayloadSiteConfig
}) => {
  const encodedCollection = encodeURIComponent(collection)
  const encodedID = id ? `/${encodeURIComponent(id)}` : ''
  const endpoint = buildPayloadSiteEndpoint({
    baseURL: site.baseURL,
    path: `/api/${encodedCollection}${encodedID}?draft=true`,
  })

  const response = await fetch(endpoint, {
    body: JSON.stringify(data),
    headers: {
      accept: 'application/json',
      authorization: getPayloadAPIKeyAuthHeader(site),
      'content-type': 'application/json',
    },
    method: operation === 'create' ? 'POST' : 'PATCH',
  })

  const body = await readJSON(response)

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Payload site draft write failed with ${response.status}.`
    throw new APIError(message, response.status)
  }

  if (!body || typeof body !== 'object') {
    throw new APIError('Payload site draft write returned an empty response.', 502)
  }

  return body as Record<string, unknown>
}

export const uploadMediaDocument = async ({
  alt,
  caption,
  collection = 'media',
  file,
  filename,
  mimeType,
  site,
}: {
  alt: string
  caption?: string
  collection?: string
  file: Blob
  filename: string
  mimeType: string
  site: PayloadSiteConfig
}) => {
  const endpoint = buildPayloadSiteEndpoint({
    baseURL: site.baseURL,
    path: `/api/${encodeURIComponent(collection)}`,
  })
  const form = new FormData()
  form.append('file', file, filename)
  form.append(
    '_payload',
    JSON.stringify({
      alt,
      ...(caption ? { caption } : {}),
    }),
  )

  const response = await fetch(endpoint, {
    body: form,
    headers: {
      accept: 'application/json',
      authorization: getPayloadAPIKeyAuthHeader(site),
    },
    method: 'POST',
  })

  const body = await readJSON(response)

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Payload site media upload failed with ${response.status}.`
    throw new APIError(message, response.status)
  }

  if (!body || typeof body !== 'object') {
    throw new APIError('Payload site media upload returned an empty response.', 502)
  }

  const result = body as Record<string, unknown>
  const id = result.id
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new APIError('Payload site media upload response did not include an id.', 502)
  }

  return {
    id: String(id),
    mimeType,
    response: result,
  }
}
