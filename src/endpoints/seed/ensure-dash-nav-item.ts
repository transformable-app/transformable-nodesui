import type { Page } from '@/payload-types'
import type { Payload, PayloadRequest } from 'payload'

type EnsureDashNavItemArgs = {
  dash: Page
  payload: Payload
  req?: PayloadRequest
}

type EnsurePageNavItemArgs = {
  label?: string
  page: Page
  payload: Payload
  replaceExistingLabel?: boolean
  req?: PayloadRequest
}

const getReferenceValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value

  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
  }

  return null
}

export const ensurePageNavItem = async ({
  label,
  page,
  payload,
  replaceExistingLabel = false,
  req,
}: EnsurePageNavItemArgs) => {
  const header = await payload.findGlobal({
    slug: 'header',
    depth: 0,
    overrideAccess: true,
    req,
  })
  const navItems = Array.isArray(header.navItems) ? header.navItems : []
  const hasPageNavItem = navItems.some((item) => {
    const link = item?.link

    if (!link) return false

    return (
      link.type === 'reference' &&
      link.reference?.relationTo === 'pages' &&
      getReferenceValue(link.reference.value) === page.id
    )
  })

  if (hasPageNavItem) return header

  if (replaceExistingLabel && label) {
    const existingLabelIndex = navItems.findIndex((item) => item?.link?.label === label)

    if (existingLabelIndex >= 0) {
      return payload.updateGlobal({
        slug: 'header',
        data: {
          navItems: navItems.map((item, index) => {
            if (index !== existingLabelIndex) return item

            return {
              ...item,
              link: {
                ...item.link,
                type: 'reference' as const,
                reference: {
                  relationTo: 'pages' as const,
                  value: page.id,
                },
                label,
              },
            }
          }),
        },
        overrideAccess: true,
        req,
      })
    }
  }

  return payload.updateGlobal({
    slug: 'header',
    data: {
      navItems: [
        ...navItems,
        {
          link: {
            type: 'reference',
            reference: {
              relationTo: 'pages',
              value: page.id,
            },
            label: label ?? page.title,
          },
        },
      ],
    },
    overrideAccess: true,
    req,
  })
}

export const ensureDashNavItem = ({ dash, payload, req }: EnsureDashNavItemArgs) =>
  ensurePageNavItem({
    label: 'Dash',
    page: dash,
    payload,
    replaceExistingLabel: true,
    req,
  })
