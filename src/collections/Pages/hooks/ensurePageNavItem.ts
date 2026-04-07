import type { CollectionAfterChangeHook } from 'payload'

import type { Page } from '@/payload-types'
import { ensurePageNavItem as ensurePageNavItemForHeader } from '@/endpoints/seed/ensure-dash-nav-item'

export const ensurePageNavItem: CollectionAfterChangeHook<Page> = async ({
  context,
  doc,
  req,
}) => {
  if (context.skipNavItemSync) {
    return doc
  }

  await ensurePageNavItemForHeader({
    page: doc,
    payload: req.payload,
    req,
  })

  return doc
}
