import { createHash } from 'crypto'

import type { SchemaProfileValidationResult } from './types'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export const hashSchemaProfile = (profile: Record<string, unknown>): string =>
  createHash('sha256').update(stableStringify(profile)).digest('hex')

export const validateSchemaProfile = (profile: unknown): SchemaProfileValidationResult => {
  const errors: string[] = []

  if (!isPlainObject(profile)) {
    return { errors: ['Schema profile must be an object.'], ok: false }
  }

  const plugin = profile.plugin
  if (!isPlainObject(plugin)) {
    errors.push('Schema profile must include plugin metadata.')
  } else if (typeof plugin.version !== 'string' || !plugin.version.trim()) {
    errors.push('Schema profile plugin.version is required.')
  }

  if (!Array.isArray(profile.collections)) {
    errors.push('Schema profile collections must be an array.')
  }

  if (profile.collections && Array.isArray(profile.collections)) {
    for (const [index, collection] of profile.collections.entries()) {
      if (!isPlainObject(collection)) {
        errors.push(`collections[${index}] must be an object.`)
        continue
      }
      if (typeof collection.slug !== 'string' || !collection.slug.trim()) {
        errors.push(`collections[${index}].slug is required.`)
      }
      if (collection.blocks !== undefined && !Array.isArray(collection.blocks)) {
        errors.push(`collections[${index}].blocks must be an array when present.`)
      }
      if (collection.fields !== undefined && !Array.isArray(collection.fields)) {
        errors.push(`collections[${index}].fields must be an array when present.`)
      }
    }
  }

  if (errors.length > 0) return { errors, ok: false }

  return {
    normalizedProfile: profile,
    ok: true,
    profileHash: hashSchemaProfile(profile),
  }
}
