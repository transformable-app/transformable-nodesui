import { NextResponse } from 'next/server'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { getServerSideURL } from '@/utilities/getURL'

/**
 * Redirects to the current admin icon from admin-settings global.
 * Used as admin.meta.icons URL so the favicon is dynamic (Payload docs: Page Metadata > Icons).
 */
export async function GET() {
  try {
    const payload = await getPayload({ config: configPromise })
    const adminSettings = await payload.findGlobal({
      slug: 'admin-settings',
      depth: 1,
    })
    const iconMedia = adminSettings?.adminIcon
    const rawUrl =
      iconMedia && typeof iconMedia === 'object' && 'url' in iconMedia
        ? (iconMedia.url as string)
        : null
    if (!rawUrl || !String(rawUrl).trim()) {
      const fallback = `${getServerSideURL()}/favicon.ico`
      return NextResponse.redirect(fallback, 302)
    }
    const base = rawUrl.startsWith('http') ? rawUrl : `${getServerSideURL()}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`
    return NextResponse.redirect(base, 302)
  } catch {
    const fallback = `${getServerSideURL()}/favicon.ico`
    return NextResponse.redirect(fallback, 302)
  }
}
