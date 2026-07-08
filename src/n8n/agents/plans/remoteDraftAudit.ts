import type { PayloadRequest } from 'payload'

import type { RemoteDraftAudit } from '@/payload-types'

export const createRemoteDraftAudit = async ({
  audit,
  req,
}: {
  audit: Partial<RemoteDraftAudit> & {
    attemptedAt: string
    status: 'attempted' | 'failed' | 'succeeded'
  }
  req: Pick<PayloadRequest, 'payload'> & Partial<PayloadRequest>
}) => {
  try {
    await req.payload.create({
      collection: 'remote-draft-audits',
      data: audit as never,
      overrideAccess: true,
      ...(typeof req === 'object' ? { req: req as PayloadRequest } : {}),
    })
  } catch {
    // Audit writes must never mask the remote write result recorded on the run.
  }
}
