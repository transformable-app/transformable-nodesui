import React from 'react'

type AllowedTag = 'link' | 'meta' | 'script'

type ParsedTag = {
  attributes: Record<string, string | boolean>
  content?: string
  tag: AllowedTag
}

const allowedTags = new Set<AllowedTag>(['link', 'meta', 'script'])

const attributePattern =
  /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const voidTagPattern = /<(meta|link)\b([^>]*)\/?>/gi

const decodeHTML = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const parseAttributes = (input: string): Record<string, string | boolean> => {
  const attributes: Record<string, string | boolean> = {}

  for (const match of input.matchAll(attributePattern)) {
    const [, rawName, doubleQuoted, singleQuoted, bareValue] = match
    const name = rawName?.trim()

    if (!name) continue

    const lowerName = name.toLowerCase()
    if (lowerName.startsWith('on')) continue

    const rawValue = doubleQuoted ?? singleQuoted ?? bareValue
    attributes[name] = rawValue === undefined ? true : decodeHTML(rawValue)
  }

  return attributes
}

const parseHeadHTML = (input?: string | null): ParsedTag[] => {
  if (!input) return []

  const parsed: ParsedTag[] = []

  for (const match of input.matchAll(scriptPattern)) {
    const attributes = parseAttributes(match[1] ?? '')
    parsed.push({
      attributes,
      content: match[2] ?? '',
      tag: 'script',
    })
  }

  for (const match of input.matchAll(voidTagPattern)) {
    const tagName = (match[1] ?? '').toLowerCase() as AllowedTag
    if (!allowedTags.has(tagName)) continue

    parsed.push({
      attributes: parseAttributes(match[2] ?? ''),
      tag: tagName,
    })
  }

  return parsed
}

export const renderHeadHTML = (input?: string | null): React.ReactNode[] =>
  parseHeadHTML(input).map(({ attributes, content, tag }, index) => {
    const key = `${tag}-${index}`

    if (tag === 'script') {
      const scriptProps = {
        ...attributes,
        dangerouslySetInnerHTML: content ? { __html: content } : undefined,
        key,
      }

      return React.createElement('script', scriptProps)
    }

    return React.createElement(tag, {
      ...attributes,
      key,
    })
  })
