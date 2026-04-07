import React from 'react'
import Image from 'next/image'
import { unstable_noStore } from 'next/cache'
import { PayloadIcon } from '@payloadcms/ui/graphics/Icon'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

type AdminIconProps = { className?: string }

const AdminIcon: React.FC<AdminIconProps> = async (props) => {
  unstable_noStore()

  const { className } = props
  const payload = await getPayload({ config: configPromise })
  const adminSettings = await payload.findGlobal({
    slug: 'admin-settings',
    depth: 1,
  })

  const iconMedia = adminSettings?.adminIcon
  const rawUrl =
    iconMedia && typeof iconMedia === 'object' && 'url' in iconMedia
      ? (iconMedia.url as string | null | undefined)
      : null
  const url = rawUrl && String(rawUrl).trim() ? String(rawUrl) : null

  if (url) {
    const base = url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_SERVER_URL || ''}${url}`
    const updatedAt = adminSettings?.updatedAt
    const src =
      typeof updatedAt === 'string'
        ? `${base}${base.includes('?') ? '&' : '?'}t=${updatedAt}`
        : base
    const iconClassName = ['graphic-icon', className].filter(Boolean).join(' ')
    return (
      <Image
        src={src}
        alt=""
        className={iconClassName}
        width={24}
        height={24}
        unoptimized
      />
    )
  }

  return <PayloadIcon />
}

export default AdminIcon
