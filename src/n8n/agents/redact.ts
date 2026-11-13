const SENSITIVE_KEY_PATTERN = /api[-_]?key|authorization|bearer|cookie|password|secret|token/i
const MAX_PREVIEW_LENGTH = 2000

const truncate = (value: string, maxLength = MAX_PREVIEW_LENGTH): string => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

export const redactValue = (value: unknown, maxStringLength = MAX_PREVIEW_LENGTH): unknown => {
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, maxStringLength))

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(entry, maxStringLength),
      ]),
    )
  }

  if (typeof value === 'string') return truncate(value, maxStringLength)

  return value
}

const stringifyRedacted = (value: unknown, maxStringLength: number): string => {
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(redactValue(value, maxStringLength)) ?? '[unserializable]'
  } catch {
    return '[unserializable]'
  }
}

export const toPreview = (value: unknown, maxLength = MAX_PREVIEW_LENGTH): string =>
  truncate(stringifyRedacted(value, MAX_PREVIEW_LENGTH), maxLength)

export const toOutputText = (value: unknown): string => stringifyRedacted(value, Infinity)
