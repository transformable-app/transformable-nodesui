import type { Metadata } from 'next'

import { cn } from '@/utilities/ui'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { Providers } from '@/providers'
import { InitTheme } from '@/providers/Theme/InitTheme'
import { checkRole } from '@/access/utilities'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { draftMode, headers as getHeaders } from 'next/headers'
import { getCachedGlobal } from '@/utilities/getGlobals'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import './globals.css'
import { getServerSideURL } from '@/utilities/getURL'
import { getMediaUrl } from '@/utilities/getMediaUrl'
import type { Header as HeaderType } from '@/payload-types'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode()
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const [headerData, { user }] = await Promise.all([
    getCachedGlobal('header', 1)() as Promise<HeaderType>,
    payload.auth({ headers }),
  ])
  const showAdminBar = checkRole(['Admin'], user)

  const metaTags = headerData?.metaTags || null

  // Get favicon URL from Header global or fall back to default
  const favicon =
    headerData?.favicon && typeof headerData.favicon === 'object' && 'url' in headerData.favicon
      ? getMediaUrl(headerData.favicon.url as string)
      : null

  // Get apple touch icon URL from Header global if available
  const appleTouchIcon =
    headerData?.appleTouchIcon &&
    typeof headerData.appleTouchIcon === 'object' &&
    'url' in headerData.appleTouchIcon
      ? getMediaUrl(headerData.appleTouchIcon.url as string)
      : null

  // Determine favicon type and add cache busting
  // Use the header's updatedAt timestamp for cache busting (changes when favicon is updated)
  const faviconCacheBuster = headerData?.updatedAt
    ? new Date(headerData.updatedAt).getTime()
    : Date.now()
  
  const faviconUrl = favicon 
    ? `${favicon}${favicon.includes('?') ? '&' : '?'}v=${faviconCacheBuster}`
    : '/favicon.ico'
  const faviconIsSvg = faviconUrl.includes('.svg')
  const hasCustomFavicon = favicon !== null

  return (
    <html className={cn(GeistSans.variable, GeistMono.variable)} lang="en" suppressHydrationWarning>
      <head>
        <InitTheme />
        {hasCustomFavicon ? (
          <>
            {faviconIsSvg ? (
              <link href={faviconUrl} rel="icon" type="image/svg+xml" />
            ) : (
              <link href={faviconUrl} rel="icon" sizes="32x32" />
            )}
          </>
        ) : (
          <>
            <link href="/favicon.ico" rel="icon" sizes="32x32" />
            <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
          </>
        )}
        {appleTouchIcon && <link href={appleTouchIcon} rel="apple-touch-icon" />}
        {metaTags && <div dangerouslySetInnerHTML={{ __html: metaTags }} />}
      </head>
      <body className="bg-background text-foreground">
        <Providers>
          <AdminBar
            adminBarProps={{
              preview: isEnabled,
            }}
            showAdminBar={showAdminBar}
          />
          {children}
        </Providers>
      </body>
    </html>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const headerData: HeaderType = await getCachedGlobal('header', 1)()

  // Get favicon URL from Header global
  const favicon =
    headerData?.favicon && typeof headerData.favicon === 'object' && 'url' in headerData.favicon
      ? getMediaUrl(headerData.favicon.url as string)
      : null

  // Get apple touch icon URL from Header global if available
  const appleTouchIcon =
    headerData?.appleTouchIcon &&
    typeof headerData.appleTouchIcon === 'object' &&
    'url' in headerData.appleTouchIcon
      ? getMediaUrl(headerData.appleTouchIcon.url as string)
      : null

  // Add cache busting to favicon
  // Use the header's updatedAt timestamp for cache busting (changes when favicon is updated)
  const faviconCacheBuster = headerData?.updatedAt
    ? new Date(headerData.updatedAt).getTime()
    : Date.now()

  const icons: Metadata['icons'] = {}
  
  if (favicon) {
    const faviconUrl = `${favicon}${favicon.includes('?') ? '&' : '?'}v=${faviconCacheBuster}`
    if (faviconUrl.includes('.svg')) {
      icons.icon = { url: faviconUrl, type: 'image/svg+xml' }
    } else {
      icons.icon = { url: faviconUrl, sizes: '32x32' }
    }
  } else {
    icons.icon = [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ]
  }

  if (appleTouchIcon) {
    icons.apple = appleTouchIcon
  }

  return {
    metadataBase: new URL(getServerSideURL()),
    icons,
    openGraph: mergeOpenGraph(),
    twitter: {
      card: 'summary_large_image',
      creator: '@payloadcms',
    },
  }
}
