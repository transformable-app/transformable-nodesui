import type { Payload } from 'payload'

import type { User } from '@/payload-types'

export const getLatestSyncAt = async ({
  payload,
  user,
}: {
  payload: Payload
  user?: User | null
}) => {
  const result = await payload.find({
    collection: 'servers',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    select: {
      lastSyncedAt: true,
    },
    sort: '-lastSyncedAt',
    user: user || undefined,
    where: {
      lastSyncedAt: {
        exists: true,
      },
    },
  })

  return result.docs[0]?.lastSyncedAt || null
}
