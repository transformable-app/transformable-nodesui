const SENSITIVE_KEY_PATTERN = /api[-_]?key|authorization|bearer|cookie|password|secret|token/i
const MAX_PREVIEW_LENGTH = 2000

const truncate = (value: string, maxLength = MAX_PREVIEW_LENGTH): string => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

export const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactValue)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(entry),
      ]),
    )
  }

  if (typeof value === 'string') return truncate(value)

  return value
}

export const toPreview = (value: unknown, maxLength = MAX_PREVIEW_LENGTH): string => {
  if (typeof value === 'string') return truncate(value, maxLength)

  try {
    return truncate(JSON.stringify(redactValue(value)), maxLength)
  } catch {
    return '[unserializable]'
  }
}
