import React from 'react'
import Image from 'next/image'
import { PayloadLogo } from '@payloadcms/ui/graphics/Logo'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

const AdminLogo: React.FC = async () => {
  const payload = await getPayload({ config: configPromise })
  const adminSettings = await payload.findGlobal({
    slug: 'admin-settings',
    depth: 1,
  })

  const logoMedia = adminSettings?.loginLogo
  const url =
    logoMedia && typeof logoMedia === 'object' && 'url' in logoMedia
      ? (logoMedia.url as string)
      : null

  if (url) {
    const src = url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_SERVER_URL || ''}${url}`
    return (
      <Image
        src={src}
        alt=""
        className="graphic-logo"
        width={193}
        height={44}
        style={{ maxWidth: '100%', height: 'auto' }}
        unoptimized
      />
    )
  }

  return <PayloadLogo />
}

export default AdminLogo
