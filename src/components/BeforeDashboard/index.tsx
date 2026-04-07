import { Banner } from '@payloadcms/ui/elements/Banner'
import React from 'react'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { getServerSideURL } from '@/utilities/getURL'
import RichText from '@/components/RichText'
import { SyncButton } from './SyncButton'
import './index.scss'

const baseClass = 'before-dashboard'

function hasLexicalTextContent(node: { children?: unknown[]; text?: string }): boolean {
  if (typeof node.text === 'string' && node.text.trim().length > 0) return true
  if (Array.isArray(node.children)) {
    return node.children.some((child) => hasLexicalTextContent(child as { children?: unknown[]; text?: string }))
  }
  return false
}

const BeforeDashboard: React.FC = async () => {
  const payload = await getPayload({ config: configPromise })
  const adminSettings = await payload.findGlobal({
    slug: 'admin-settings',
    depth: 0,
  })

  const siteURL = getServerSideURL()

  const bannerStyle: React.CSSProperties & Record<string, string> = {}
  if (adminSettings?.bannerBg) bannerStyle['--banner-bg'] = adminSettings.bannerBg
  if (adminSettings?.bannerText) bannerStyle['--banner-text'] = adminSettings.bannerText
  if (adminSettings?.bannerLink) bannerStyle['--banner-link'] = adminSettings.bannerLink
  if (adminSettings?.bannerLink) bannerStyle['--banner-link-hover'] = adminSettings.bannerLink
  if (adminSettings?.bannerBgDark) bannerStyle['--banner-bg-dark'] = adminSettings.bannerBgDark
  if (adminSettings?.bannerTextDark) bannerStyle['--banner-text-dark'] = adminSettings.bannerTextDark
  if (adminSettings?.bannerLinkDark) bannerStyle['--banner-link-dark'] = adminSettings.bannerLinkDark

  const bannerExtraContent = adminSettings?.dashboardBannerExtraContent
  const hasBannerExtra =
    bannerExtraContent?.root &&
    Array.isArray(bannerExtraContent.root.children) &&
    bannerExtraContent.root.children.length > 0 &&
    hasLexicalTextContent(bannerExtraContent.root as { children?: unknown[]; text?: string })

  return (
    <div className={baseClass} style={Object.keys(bannerStyle).length > 0 ? bannerStyle : undefined}>
      <Banner className={`${baseClass}__banner`} type="success">
        <h4>
          Welcome to your dashboards admin for{' '}
          <a href={siteURL} target="_blank" rel="noopener noreferrer">
            {siteURL}
          </a>
          !
        </h4>
        <div className={`${baseClass}__actions`}>
          <SyncButton />
        </div>
        {hasBannerExtra ? (
          <div className={`${baseClass}__banner-extra`}>
            <RichText data={bannerExtraContent as never} enableGutter={false} enableProse={true} />
          </div>
        ) : null}
      </Banner>
    </div>
  )
}

export default BeforeDashboard
