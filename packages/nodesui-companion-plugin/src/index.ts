import type { Config, Endpoint, Field, Plugin } from 'payload'

import type { NodesUICompanionPluginOptions } from './types.js'

export type { NodesUICompanionPluginOptions } from './types.js'

type SchemaFieldProfile = {
  fields?: SchemaFieldProfile[]
  hasMany?: boolean
  label?: unknown
  maxRows?: number
  minRows?: number
  name: string
  options?: Array<{ label?: unknown; value: string }>
  relationTo?: string | string[]
  required?: boolean
  type: string
}

const DEFAULT_ENDPOINT_PATH = '/nodesui/schema-profile'
const DEFAULT_PLUGIN_VERSION = '0.1.0'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const fieldRecord = (field: Field): Record<string, unknown> => field as unknown as Record<string, unknown>

const fieldHasSubFields = (field: Field): field is Field & { fields: Field[] } =>
  Array.isArray(fieldRecord(field).fields)

const fieldIsArrayType = (field: Field): field is Field & { maxRows?: number; minRows?: number } =>
  field.type === 'array'

const fieldIsBlockType = (
  field: Field,
): field is Field & { blocks: Array<{ fields: Field[]; slug: string }> } =>
  field.type === 'blocks' && Array.isArray(fieldRecord(field).blocks)

const fieldSupportsMany = (field: Field) => 'hasMany' in fieldRecord(field)

const getStringOptionValue = (option: unknown): { label?: unknown; value: string } | null => {
  if (typeof option === 'string') return { value: option }
  if (isPlainObject(option) && typeof option.value === 'string') {
    return { label: option.label, value: option.value }
  }
  return null
}

const getSelectOptions = (field: Field) => {
  const record = fieldRecord(field)
  if (!Array.isArray(record.options)) return undefined

  const options = record.options
    .map(getStringOptionValue)
    .filter((option): option is { label?: unknown; value: string } => Boolean(option))

  return options.length > 0 ? options : undefined
}

const getRelationTo = (field: Field) => {
  const relationTo = fieldRecord(field).relationTo
  return typeof relationTo === 'string' || Array.isArray(relationTo) ? relationTo : undefined
}

const getFieldName = (field: Field): string | null => {
  const name = fieldRecord(field).name
  if (typeof name === 'string') return name
  return null
}

const getFieldProfile = (field: Field): SchemaFieldProfile | null => {
  const name = getFieldName(field)
  if (!name) return null
  const record = fieldRecord(field)

  const profile: SchemaFieldProfile = {
    hasMany: fieldSupportsMany(field) && record.hasMany === true ? true : undefined,
    label: record.label,
    name,
    options: getSelectOptions(field),
    relationTo: getRelationTo(field),
    required: record.required === true ? true : undefined,
    type: field.type,
  }

  if (fieldIsArrayType(field)) {
    profile.maxRows = typeof record.maxRows === 'number' ? record.maxRows : undefined
    profile.minRows = typeof record.minRows === 'number' ? record.minRows : undefined
  }

  if (fieldHasSubFields(field)) {
    profile.fields = field.fields.map(getFieldProfile).filter((item): item is SchemaFieldProfile => Boolean(item))
  }

  return profile
}

const getFieldPaths = (fields: SchemaFieldProfile[], prefix = ''): string[] =>
  fields.flatMap((field) => {
    const path = prefix ? `${prefix}.${field.name}` : field.name
    const nested = field.fields ? getFieldPaths(field.fields, path) : []
    return [path, ...nested]
  })

const getBlockProfiles = (fields: Field[]) => {
  const blocks: Array<{ fields: SchemaFieldProfile[]; slug: string }> = []

  for (const field of fields) {
    if (fieldIsBlockType(field)) {
      for (const block of field.blocks) {
        blocks.push({
          fields: block.fields
            .map(getFieldProfile)
            .filter((item): item is SchemaFieldProfile => Boolean(item)),
          slug: block.slug,
        })
      }
    }

    if (fieldHasSubFields(field)) {
      blocks.push(...getBlockProfiles(field.fields))
    }
  }

  return blocks
}

const buildSchemaProfile = (config: Config, options: Required<NodesUICompanionPluginOptions>) => {
  const writable = new Set(options.writableCollections)
  const sourceCollections = config.collections ?? []
  const collections = sourceCollections
    .filter((collection) => writable.size === 0 || writable.has(collection.slug))
    .map((collection) => {
      const fields = collection.fields
        .map(getFieldProfile)
        .filter((field): field is SchemaFieldProfile => Boolean(field))
      const blocks = getBlockProfiles(collection.fields)

      return {
        blocks,
        draftSupport: Boolean(collection.versions && typeof collection.versions === 'object' && collection.versions.drafts),
        fields,
        fieldPaths: getFieldPaths(fields),
        labels: collection.labels,
        slug: collection.slug,
        upload: Boolean(collection.upload),
        versions: Boolean(collection.versions),
      }
    })

  return {
    capabilities: {
      drafts: collections.some((collection) => collection.draftSupport),
      uploads: collections.some((collection) => collection.upload),
    },
    collections,
    plugin: {
      compatible: true,
      name: 'nodesui-companion',
      version: options.pluginVersion,
    },
  }
}

export const nodesUICompanionPlugin =
  (pluginOptions: NodesUICompanionPluginOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    const options: Required<NodesUICompanionPluginOptions> = {
      endpointPath: pluginOptions.endpointPath || DEFAULT_ENDPOINT_PATH,
      pluginVersion: pluginOptions.pluginVersion || DEFAULT_PLUGIN_VERSION,
      writableCollections: pluginOptions.writableCollections || ['pages', 'media'],
    }

    const schemaProfileEndpoint: Endpoint = {
      path: options.endpointPath,
      method: 'get',
      handler: async () => Response.json({ schemaProfile: buildSchemaProfile(incomingConfig, options) }),
    }

    return {
      ...incomingConfig,
      endpoints: [...(incomingConfig.endpoints ?? []), schemaProfileEndpoint],
    }
  }
