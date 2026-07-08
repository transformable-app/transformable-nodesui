import { readFile } from 'fs/promises'
import path from 'path'

import { APIError, type PayloadRequest } from 'payload'

import { findRemoteDocumentID, uploadMediaDocument, writeDraftDocument } from '@/payloadSites/client'
import type { AgentArtifact, Media, PayloadSite } from '@/payload-types'

import { createRemoteDraftAudit } from './remoteDraftAudit'

type CMSDraftTarget = {
  collection: string
  id?: string
  locale?: string
  operation: 'create' | 'update'
  payloadSite: string
  tenant?: string
}

type CMSDraftOutput = {
  document: Record<string, unknown>
  mediaRequests?: CMSDraftMediaRequest[]
  target: CMSDraftTarget
}

type CMSDraftMediaRequest = {
  alt: string
  artifactID?: string
  caption?: string
  id: string
  purpose: 'block-asset' | 'download' | 'inline' | 'seo-image'
  sourceURL?: string
  targetCollection?: string
  targetFieldPath: string
}

type CMSDraftOutputBinding = {
  allowedBlocks?: string[]
  allowedFields?: string[]
  collection: string
  fieldMappings?: Array<{
    sourcePath: string
    targetPath: string
  }>
  operation?: 'create' | 'update'
  payloadSite: string
  relationshipResolvers?: Array<{
    collection: string
    matchField?: string
    required?: boolean
    targetPath: string
  }>
}

type CMSDraftMediaSource =
  | {
      sourceURL: string
      type: 'url'
    }
  | {
      filename: string
      localPath: string
      mimeType: string
      size?: number
      type: 'local-media'
    }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const getRelationshipID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

const getRemoteID = (response: Record<string, unknown>): string | undefined => {
  const doc = isPlainObject(response.doc) ? response.doc : response
  const id = doc.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

const normalizePath = (path: string) => path.replace(/\.\d+(?=\.|$)/g, '.*')

const collectDocumentPaths = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectDocumentPaths(item, prefix ? `${prefix}.${index}` : String(index)),
    )
  }

  if (!isPlainObject(value)) return prefix ? [prefix] : []

  const paths: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key
    paths.push(nextPath)
    paths.push(...collectDocumentPaths(child, nextPath))
  }
  return paths
}

const getCollectionSchema = (site: PayloadSite, collection: string): Record<string, unknown> | null => {
  const profile = site.schemaProfile
  if (!isPlainObject(profile) || !Array.isArray(profile.collections)) return null

  return (
    profile.collections.find(
      (candidate): candidate is Record<string, unknown> =>
        isPlainObject(candidate) && candidate.slug === collection,
    ) ?? null
  )
}

const getAllowedBlockSlugs = (collectionSchema: Record<string, unknown> | null) => {
  if (!collectionSchema || !Array.isArray(collectionSchema.blocks)) return null

  const slugs = collectionSchema.blocks
    .map((block) => (isPlainObject(block) ? getString(block.slug) : undefined))
    .filter((slug): slug is string => Boolean(slug))

  return slugs.length > 0 ? new Set(slugs) : null
}

const getURLTemplate = (site: PayloadSite, key: 'admin' | 'preview') => {
  const profile = site.schemaProfile
  if (!isPlainObject(profile) || !isPlainObject(profile.urlTemplates)) return undefined

  return getString(profile.urlTemplates[key])
}

const encodeURLToken = (value: string | undefined) => encodeURIComponent(value ?? '')

const resolveURLTemplate = ({
  collection,
  documentID,
  locale,
  site,
  template,
  tenant,
  versionID,
}: {
  collection: string
  documentID?: string
  locale?: string
  site: PayloadSite
  template?: string
  tenant?: string
  versionID?: string
}) => {
  if (!template) return undefined

  const path = template.replace(/\{(collection|id|versionID|locale|tenant)\}/g, (_, token: string) => {
    switch (token) {
      case 'collection':
        return encodeURLToken(collection)
      case 'id':
        return encodeURLToken(documentID)
      case 'versionID':
        return encodeURLToken(versionID)
      case 'locale':
        return encodeURLToken(locale)
      case 'tenant':
        return encodeURLToken(tenant)
      default:
        return ''
    }
  })

  try {
    return new URL(path, site.baseURL || undefined).toString()
  } catch {
    return undefined
  }
}

const collectBlockTypes = (value: unknown): string[] => {
  const blockTypes: string[] = []
  if (Array.isArray(value)) {
    for (const item of value) blockTypes.push(...collectBlockTypes(item))
    return blockTypes
  }

  if (!isPlainObject(value)) return blockTypes

  const blockType = getString(value.blockType)
  if (blockType) blockTypes.push(blockType)

  for (const child of Object.values(value)) {
    blockTypes.push(...collectBlockTypes(child))
  }

  return blockTypes
}

const getFieldAllowlist = (site: PayloadSite, collection: string) => {
  const allowlist = site.fieldAllowlists?.find((entry) => entry.collection === collection)
  return allowlist?.paths?.filter((path): path is string => typeof path === 'string') ?? []
}

const isPathAllowed = (path: string, allowedPaths: string[]) => {
  const normalizedPath = normalizePath(path)
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowedPath = normalizePath(allowedPath)
    return (
      normalizedPath === normalizedAllowedPath ||
      normalizedPath.startsWith(`${normalizedAllowedPath}.`) ||
      (normalizedAllowedPath.endsWith('.*') &&
        normalizedPath.startsWith(normalizedAllowedPath.slice(0, -2)))
    )
  })
}

const getStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : undefined

const parseOutputBinding = (value: unknown): CMSDraftOutputBinding | null => {
  if (!isPlainObject(value)) return null

  const payloadSite = getString(value.payloadSite)
  const collection = getString(value.collection)
  const operation = value.operation === 'create' || value.operation === 'update' ? value.operation : undefined
  const fieldMappings = Array.isArray(value.fieldMappings)
    ? value.fieldMappings
        .map((mapping) => {
          if (!isPlainObject(mapping)) return null
          const sourcePath = getString(mapping.sourcePath)
          const targetPath = getString(mapping.targetPath)
          return sourcePath && targetPath ? { sourcePath, targetPath } : null
        })
        .filter((mapping): mapping is { sourcePath: string; targetPath: string } => Boolean(mapping))
    : undefined
  const relationshipResolvers = Array.isArray(value.relationshipResolvers)
    ? value.relationshipResolvers
        .map((resolver) => {
          if (!isPlainObject(resolver)) return null
          const targetPath = getString(resolver.targetPath)
          const collection = getString(resolver.collection)
          if (!targetPath || !collection) return null

          const matchField = getString(resolver.matchField)
          return {
            collection,
            ...(matchField ? { matchField } : {}),
            ...(typeof resolver.required === 'boolean' ? { required: resolver.required } : {}),
            targetPath,
          }
        })
        .filter(
          (resolver): resolver is {
            collection: string
            matchField?: string
            required?: boolean
            targetPath: string
          } => Boolean(resolver),
        )
    : undefined

  if (!payloadSite || !collection) return null

  return {
    allowedBlocks: getStringArray(value.allowedBlocks),
    allowedFields: getStringArray(value.allowedFields),
    collection,
    fieldMappings,
    operation,
    payloadSite,
    relationshipResolvers,
  }
}

const assertDraftMatchesBinding = (
  binding: CMSDraftOutputBinding,
  draft: CMSDraftOutput,
): void => {
  if (draft.target.payloadSite !== binding.payloadSite) {
    throw new APIError('CMS draft target payloadSite does not match the output binding.', 400)
  }
  if (draft.target.collection !== binding.collection) {
    throw new APIError('CMS draft target collection does not match the output binding.', 400)
  }
  if (binding.operation && draft.target.operation !== binding.operation) {
    throw new APIError('CMS draft target operation does not match the output binding.', 400)
  }
}

const validateDraftDocumentAgainstSite = ({
  collection,
  document,
  mediaRequests,
  site,
}: {
  collection: string
  document: Record<string, unknown>
  mediaRequests?: CMSDraftMediaRequest[]
  site: PayloadSite
}) => {
  const collectionSchema = getCollectionSchema(site, collection)
  if (!collectionSchema) {
    throw new APIError(`Schema profile does not include collection "${collection}".`, 400)
  }

  const allowedPaths = getFieldAllowlist(site, collection)
  if (allowedPaths.length > 0) {
    const disallowedPath = collectDocumentPaths(document).find(
      (path) => !isPathAllowed(path, allowedPaths),
    )
    if (disallowedPath) {
      throw new APIError(`Generated document field "${disallowedPath}" is not allowlisted.`, 400)
    }

    const disallowedMediaPath = mediaRequests?.find(
      (request) => !isPathAllowed(request.targetFieldPath, allowedPaths),
    )
    if (disallowedMediaPath) {
      throw new APIError(
        `Media target field "${disallowedMediaPath.targetFieldPath}" is not allowlisted.`,
        400,
      )
    }
  }

  const allowedBlockSlugs = getAllowedBlockSlugs(collectionSchema)
  if (allowedBlockSlugs) {
    const disallowedBlockType = collectBlockTypes(document).find(
      (blockType) => !allowedBlockSlugs.has(blockType),
    )
    if (disallowedBlockType) {
      throw new APIError(`Block type "${disallowedBlockType}" is not allowed for this site.`, 400)
    }
  }
}

const validateDraftDocumentAgainstBinding = ({
  binding,
  document,
  mediaRequests,
}: {
  binding: CMSDraftOutputBinding
  document: Record<string, unknown>
  mediaRequests?: CMSDraftMediaRequest[]
}) => {
  if (binding.allowedFields?.length) {
    const disallowedPath = collectDocumentPaths(document).find(
      (path) => !isPathAllowed(path, binding.allowedFields ?? []),
    )
    if (disallowedPath) {
      throw new APIError(`Generated document field "${disallowedPath}" is not allowed by output binding.`, 400)
    }

    const disallowedMediaPath = mediaRequests?.find(
      (request) => !isPathAllowed(request.targetFieldPath, binding.allowedFields ?? []),
    )
    if (disallowedMediaPath) {
      throw new APIError(
        `Media target field "${disallowedMediaPath.targetFieldPath}" is not allowed by output binding.`,
        400,
      )
    }
  }

  if (binding.allowedBlocks?.length) {
    const allowedBlocks = new Set(binding.allowedBlocks)
    const disallowedBlockType = collectBlockTypes(document).find(
      (blockType) => !allowedBlocks.has(blockType),
    )
    if (disallowedBlockType) {
      throw new APIError(`Block type "${disallowedBlockType}" is not allowed by output binding.`, 400)
    }
  }
}

const parseMediaRequest = (value: unknown, index: number): CMSDraftMediaRequest => {
  if (!isPlainObject(value)) {
    throw new APIError(`mediaRequests[${index}] must be an object.`, 400)
  }

  const id = getString(value.id)
  const targetFieldPath = getString(value.targetFieldPath)
  const alt = getString(value.alt)
  const purpose =
    value.purpose === 'block-asset' ||
    value.purpose === 'download' ||
    value.purpose === 'inline' ||
    value.purpose === 'seo-image'
      ? value.purpose
      : undefined

  if (!id) throw new APIError(`mediaRequests[${index}].id is required.`, 400)
  if (!purpose) throw new APIError(`mediaRequests[${index}].purpose is invalid.`, 400)
  if (!targetFieldPath) {
    throw new APIError(`mediaRequests[${index}].targetFieldPath is required.`, 400)
  }
  if (!alt) throw new APIError(`mediaRequests[${index}].alt is required.`, 400)

  const artifactID = getString(value.artifactID)
  const sourceURL = getString(value.sourceURL)
  if (!artifactID && !sourceURL) {
    throw new APIError(`mediaRequests[${index}] requires artifactID or sourceURL.`, 400)
  }

  return {
    alt,
    artifactID,
    caption: getString(value.caption),
    id,
    purpose,
    sourceURL,
    targetCollection: getString(value.targetCollection),
    targetFieldPath,
  }
}

const setValueAtPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0 || parts.some((part) => part === '__proto__' || part === 'constructor')) {
    throw new APIError(`Invalid media target field path "${path}".`, 400)
  }

  let current: Record<string, unknown> | unknown[] = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    const nextKey = parts[index + 1]
    const arrayIndex = Number(key)

    if (Array.isArray(current)) {
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0) {
        throw new APIError(`Invalid array index in media target field path "${path}".`, 400)
      }
      if (!isPlainObject(current[arrayIndex]) && !Array.isArray(current[arrayIndex])) {
        current[arrayIndex] = Number.isInteger(Number(nextKey)) ? [] : {}
      }
      current = current[arrayIndex] as Record<string, unknown> | unknown[]
      continue
    }

    const next = current[key]
    if (!isPlainObject(next) && !Array.isArray(next)) {
      current[key] = Number.isInteger(Number(nextKey)) ? [] : {}
    }
    current = current[key] as Record<string, unknown> | unknown[]
  }

  const finalKey = parts[parts.length - 1]
  if (Array.isArray(current)) {
    const arrayIndex = Number(finalKey)
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) {
      throw new APIError(`Invalid array index in media target field path "${path}".`, 400)
    }
    current[arrayIndex] = value
    return
  }

  current[finalKey] = value
}

const getValueAtPath = (target: Record<string, unknown>, path: string) => {
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0 || parts.some((part) => part === '__proto__' || part === 'constructor')) {
    throw new APIError(`Invalid field path "${path}".`, 400)
  }

  let current: unknown = target
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part)
      if (!Number.isInteger(index) || index < 0) return undefined
      current = current[index]
      continue
    }

    if (!isPlainObject(current)) return undefined
    current = current[part]
  }

  return current
}

const getRelationshipLookupValues = (value: unknown) => {
  if (Array.isArray(value)) return value.map(getString).filter((item): item is string => Boolean(item))
  const single = getString(value)
  return single ? [single] : []
}

const resolveRelationshipValues = async ({
  binding,
  document,
  req,
  site,
}: {
  binding: CMSDraftOutputBinding
  document: Record<string, unknown>
  req: PayloadRequest
  site: PayloadSite
}) => {
  if (!binding.relationshipResolvers?.length) return

  for (const resolver of binding.relationshipResolvers) {
    const currentValue = getValueAtPath(document, resolver.targetPath)
    if (currentValue === undefined || currentValue === null || currentValue === '') {
      if (resolver.required) {
        throw new APIError(`Relationship field "${resolver.targetPath}" is required by output binding.`, 400)
      }
      continue
    }

    const lookupValues = getRelationshipLookupValues(currentValue)
    if (lookupValues.length === 0) {
      throw new APIError(`Relationship field "${resolver.targetPath}" must be a string or string array.`, 400)
    }

    const resolvedIDs: string[] = []
    for (const lookupValue of lookupValues) {
      const resolvedID = await findRemoteDocumentID({
        collection: resolver.collection,
        matchField: resolver.matchField || 'slug',
        matchValue: lookupValue,
        site,
      })

      if (!resolvedID) {
        if (resolver.required !== false) {
          throw new APIError(
            `Relationship field "${resolver.targetPath}" could not resolve "${lookupValue}" in ${resolver.collection}.`,
            400,
          )
        }
        continue
      }

      resolvedIDs.push(resolvedID)
    }

    setValueAtPath(document, resolver.targetPath, Array.isArray(currentValue) ? resolvedIDs : resolvedIDs[0])
  }
}

const parseCMSDraftOutput = (value: unknown): CMSDraftOutput => {
  if (!isPlainObject(value)) {
    throw new APIError('CMS draft output must be an object.', 400)
  }

  const target = value.target
  if (!isPlainObject(target)) {
    throw new APIError('CMS draft output target is required.', 400)
  }

  const payloadSite = getString(target.payloadSite)
  const collection = getString(target.collection)
  const operation = target.operation === 'update' ? 'update' : target.operation === 'create' ? 'create' : null

  if (!payloadSite) throw new APIError('CMS draft target.payloadSite is required.', 400)
  if (!collection) throw new APIError('CMS draft target.collection is required.', 400)
  if (!operation) throw new APIError('CMS draft target.operation must be create or update.', 400)

  const document = value.document
  if (!isPlainObject(document)) {
    throw new APIError('CMS draft output document is required.', 400)
  }

  const mediaRequests = Array.isArray(value.mediaRequests)
    ? value.mediaRequests.map(parseMediaRequest)
    : undefined

  return {
    document,
    mediaRequests,
    target: {
      collection,
      id: getString(target.id),
      locale: getString(target.locale),
      operation,
      payloadSite,
      tenant: getString(target.tenant),
    },
  }
}

const loadPayloadSite = async ({
  idOrSlug,
  req,
}: {
  idOrSlug: string
  req: PayloadRequest
}): Promise<PayloadSite> => {
  const byID = await req.payload
    .findByID({
      collection: 'payload-sites',
      depth: 0,
      id: idOrSlug,
      overrideAccess: true,
      req,
    })
    .catch(() => null)

  if (byID) return byID

  const bySlug = await req.payload.find({
    collection: 'payload-sites',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: { slug: { equals: idOrSlug } },
  })

  const site = bySlug.docs[0]
  if (!site) throw new APIError('Payload site not found.', 404)
  return site
}

const assertSiteCanWrite = (site: PayloadSite, collection: string) => {
  if (!site.enabled) throw new APIError('Payload site is disabled.', 400)
  if (!site.writeBackEnabled) throw new APIError('Payload site write-back is not enabled.', 400)
  if (site.companionPluginStatus !== 'connected') {
    throw new APIError('Payload site companion plugin is not connected.', 400)
  }
  if (site.schemaProfileStatus !== 'synced') {
    throw new APIError('Payload site schema profile is not synced.', 400)
  }
  if (!site.allowedCollections?.includes(collection)) {
    throw new APIError(`Collection "${collection}" is not allowed for this Payload site.`, 400)
  }
}

const getArtifactSourceURL = (artifact: AgentArtifact): CMSDraftMediaSource | undefined => {
  if (artifact.kind === 'url' && artifact.url) return { sourceURL: artifact.url, type: 'url' }
  if (artifact.kind === 'media' && artifact.url) return { sourceURL: artifact.url, type: 'url' }
  if (artifact.data && isPlainObject(artifact.data)) {
    const sourceURL = getString(artifact.data.url) ?? getString(artifact.data.sourceURL)
    if (sourceURL) return { sourceURL, type: 'url' }
  }
  return undefined
}

const getMediaFromArtifact = async ({
  artifact,
  req,
}: {
  artifact: AgentArtifact
  req: PayloadRequest
}): Promise<Media | null> => {
  const mediaID = getRelationshipID(artifact.media)
  if (artifact.media && typeof artifact.media === 'object' && 'filename' in artifact.media) {
    return artifact.media as Media
  }
  if (!mediaID) return null

  return req.payload.findByID({
    collection: 'media',
    depth: 0,
    id: mediaID,
    overrideAccess: true,
    req,
  })
}

const getArtifactLocalMediaSource = async ({
  artifact,
  req,
}: {
  artifact: AgentArtifact
  req: PayloadRequest
}): Promise<CMSDraftMediaSource | undefined> => {
  if (artifact.kind !== 'media') return undefined

  const media = await getMediaFromArtifact({ artifact, req })
  const filename = getString(media?.filename)
  const mimeType = getString(media?.mimeType)
  if (!filename || !mimeType) return undefined

  return {
    filename,
    localPath: path.join(process.cwd(), 'public', 'media', path.basename(filename)),
    mimeType,
    size: typeof media?.filesize === 'number' ? media.filesize : undefined,
    type: 'local-media',
  }
}

const getMediaSource = async ({
  mediaRequest,
  req,
}: {
  mediaRequest: CMSDraftMediaRequest
  req: PayloadRequest
}): Promise<CMSDraftMediaSource | undefined> => {
  if (mediaRequest.sourceURL) return { sourceURL: mediaRequest.sourceURL, type: 'url' }
  if (!mediaRequest.artifactID) return undefined

  const artifact = await req.payload.findByID({
    collection: 'agent-artifacts',
    depth: 1,
    id: mediaRequest.artifactID,
    overrideAccess: true,
    req,
  })

  return getArtifactSourceURL(artifact) ?? getArtifactLocalMediaSource({ artifact, req })
}

const getFilenameFromURL = (sourceURL: string, mimeType: string, fallbackID: string) => {
  const pathname = new URL(sourceURL).pathname
  const candidate = pathname.split('/').filter(Boolean).pop()
  if (candidate?.includes('.')) return candidate

  const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin'
  return `${fallbackID}.${extension}`
}

const validateMediaSourceURL = (sourceURL: string) => {
  const parsed = new URL(sourceURL)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new APIError('Media source URL must use HTTP or HTTPS.', 400)
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new APIError('Media source URL must not include credentials or fragments.', 400)
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const hostname = parsed.hostname.toLowerCase()
  if (
    isProduction &&
    (parsed.protocol !== 'https:' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1')
  ) {
    throw new APIError('Media source URL is not allowed in production.', 400)
  }
}

const getMediaPolicy = (site: PayloadSite) => ({
  allowedMimeTypes: site.mediaPolicy?.allowedMimeTypes?.filter(
    (value): value is string => typeof value === 'string',
  ) ?? ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxFileSizeBytes: site.mediaPolicy?.maxFileSizeBytes ?? 10_485_760,
})

const fetchMediaBlob = async ({
  mediaRequest,
  site,
  sourceURL,
}: {
  mediaRequest: CMSDraftMediaRequest
  site: PayloadSite
  sourceURL: string
}) => {
  validateMediaSourceURL(sourceURL)
  const response = await fetch(sourceURL, { method: 'GET', redirect: 'follow' })
  if (!response.ok) {
    throw new APIError(`Media request "${mediaRequest.id}" failed with ${response.status}.`, 502)
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  const policy = getMediaPolicy(site)
  if (!policy.allowedMimeTypes.includes(mimeType)) {
    throw new APIError(`Media request "${mediaRequest.id}" returned disallowed MIME type ${mimeType}.`, 400)
  }

  const contentLength = getNumber(Number(response.headers.get('content-length')))
  if (contentLength && contentLength > policy.maxFileSizeBytes) {
    throw new APIError(`Media request "${mediaRequest.id}" exceeds the target site media size limit.`, 400)
  }

  const blob = await response.blob()
  if (blob.size > policy.maxFileSizeBytes) {
    throw new APIError(`Media request "${mediaRequest.id}" exceeds the target site media size limit.`, 400)
  }

  return {
    blob,
    filename: getFilenameFromURL(sourceURL, mimeType, mediaRequest.id),
    mimeType,
  }
}

const readLocalMediaBlob = async ({
  mediaRequest,
  site,
  source,
}: {
  mediaRequest: CMSDraftMediaRequest
  site: PayloadSite
  source: Extract<CMSDraftMediaSource, { type: 'local-media' }>
}) => {
  const policy = getMediaPolicy(site)
  if (!policy.allowedMimeTypes.includes(source.mimeType)) {
    throw new APIError(`Media request "${mediaRequest.id}" returned disallowed MIME type ${source.mimeType}.`, 400)
  }
  if (source.size && source.size > policy.maxFileSizeBytes) {
    throw new APIError(`Media request "${mediaRequest.id}" exceeds the target site media size limit.`, 400)
  }

  const buffer = await readFile(source.localPath)
  if (buffer.byteLength > policy.maxFileSizeBytes) {
    throw new APIError(`Media request "${mediaRequest.id}" exceeds the target site media size limit.`, 400)
  }

  return {
    blob: new Blob([buffer], { type: source.mimeType }),
    filename: source.filename,
    mimeType: source.mimeType,
  }
}

const resolveMediaBlob = ({
  mediaRequest,
  site,
  source,
}: {
  mediaRequest: CMSDraftMediaRequest
  site: PayloadSite
  source: CMSDraftMediaSource
}) => {
  if (source.type === 'url') {
    return fetchMediaBlob({ mediaRequest, site, sourceURL: source.sourceURL })
  }

  return readLocalMediaBlob({ mediaRequest, site, source })
}

const resolveMediaRequests = async ({
  document,
  mediaRequests,
  req,
  site,
}: {
  document: Record<string, unknown>
  mediaRequests?: CMSDraftMediaRequest[]
  req: PayloadRequest
  site: PayloadSite
}) => {
  if (!mediaRequests?.length) return []

  const mediaIDs: string[] = []
  for (const mediaRequest of mediaRequests) {
    const source = await getMediaSource({ mediaRequest, req })
    if (!source) {
      throw new APIError(`Media request "${mediaRequest.id}" did not resolve to a media source.`, 400)
    }

    const fetched = await resolveMediaBlob({ mediaRequest, site, source })
    const upload = await uploadMediaDocument({
      alt: mediaRequest.alt,
      caption: mediaRequest.caption,
      collection: mediaRequest.targetCollection || 'media',
      file: fetched.blob,
      filename: fetched.filename,
      mimeType: fetched.mimeType,
      site,
    })

    mediaIDs.push(upload.id)
    setValueAtPath(document, mediaRequest.targetFieldPath, upload.id)
  }

  return mediaIDs
}

export const writeCMSDraftFromTaskOutput = async ({
  outputBinding,
  output,
  req,
  runID,
}: {
  outputBinding?: unknown
  output: unknown
  req: PayloadRequest
  runID: string
}) => {
  const draft = parseCMSDraftOutput(output)
  const binding = parseOutputBinding(outputBinding)
  if (!binding) throw new APIError('CMS draft output binding is required.', 400)
  assertDraftMatchesBinding(binding, draft)
  const site = await loadPayloadSite({ idOrSlug: draft.target.payloadSite, req })
  const document = { ...draft.document }
  const payloadSiteID = String(site.id)
  const attemptedAt = new Date().toISOString()

  try {
    assertSiteCanWrite(site, draft.target.collection)
    validateDraftDocumentAgainstBinding({
      binding,
      document,
      mediaRequests: draft.mediaRequests,
    })
    validateDraftDocumentAgainstSite({
      collection: draft.target.collection,
      document,
      mediaRequests: draft.mediaRequests,
      site,
    })
    await resolveRelationshipValues({
      binding,
      document,
      req,
      site,
    })
    const mediaIDs = await resolveMediaRequests({
      document,
      mediaRequests: draft.mediaRequests,
      req,
      site,
    })

    const response = await writeDraftDocument({
      collection: draft.target.collection,
      data: document,
      id: draft.target.id,
      operation: draft.target.operation,
      site,
    })

    const remoteDocumentID = getRemoteID(response)
    const remoteVersionID =
      getString(response.versionID) ??
      (isPlainObject(response.version) ? getString(response.version.id) : undefined)

    const adminURL =
      resolveURLTemplate({
        collection: draft.target.collection,
        documentID: remoteDocumentID,
        locale: draft.target.locale,
        site,
        template: getURLTemplate(site, 'admin'),
        tenant: draft.target.tenant,
        versionID: remoteVersionID,
      }) ||
      site.adminURL ||
      undefined
    const previewURL = resolveURLTemplate({
      collection: draft.target.collection,
      documentID: remoteDocumentID,
      locale: draft.target.locale,
      site,
      template: getURLTemplate(site, 'preview'),
      tenant: draft.target.tenant,
      versionID: remoteVersionID,
    })
    const remoteDraft = {
      adminURL,
      collection: draft.target.collection,
      documentID: remoteDocumentID,
      lastSyncedAt: new Date().toISOString(),
      locale: draft.target.locale,
      mediaIDs,
      operation: draft.target.operation,
      payloadSite: payloadSiteID,
      previewURL,
      response,
      status: 'created' as const,
      tenant: draft.target.tenant,
      versionID: remoteVersionID,
    }

    await req.payload.update({
      collection: 'agent-runs',
      data: {
        remoteDraft,
      },
      id: runID,
      overrideAccess: true,
      req,
    })

    await createRemoteDraftAudit({
      audit: {
        adminURL,
        attemptedAt,
        collection: draft.target.collection,
        completedAt: new Date().toISOString(),
        mediaIDs,
        operation: draft.target.operation,
        outputBinding: binding,
        payloadSite: payloadSiteID,
        previewURL,
        remoteDocumentID,
        remoteVersionID,
        requestDocument: document,
        response,
        run: runID,
        status: 'succeeded',
        target: draft.target,
      },
      req,
    })

    return remoteDraft
  } catch (error) {
    await createRemoteDraftAudit({
      audit: {
        attemptedAt,
        collection: draft.target.collection,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'CMS draft write failed.',
        operation: draft.target.operation,
        outputBinding: binding,
        payloadSite: payloadSiteID,
        requestDocument: document,
        run: runID,
        status: 'failed',
        target: draft.target,
      },
      req,
    })

    throw error
  }
}

export const recordCMSDraftWriteFailure = async ({
  error,
  req,
  runID,
}: {
  error: string
  req: PayloadRequest
  runID: string
}) =>
  req.payload.update({
    collection: 'agent-runs',
    data: {
      remoteDraft: {
        error,
        lastSyncedAt: new Date().toISOString(),
        status: 'failed',
      },
    },
    id: runID,
    overrideAccess: true,
    req,
  })

export const getExpectedOutputType = (value: unknown): string | null => {
  if (!isPlainObject(value)) return null
  const type = value.type
  return typeof type === 'string' ? type : null
}

export const getRelatedID = getRelationshipID
