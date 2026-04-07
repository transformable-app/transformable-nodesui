import React from 'react'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import RichText from '@/components/RichText'

const BeforeLogin: React.FC = async () => {
  const payload = await getPayload({ config: configPromise })
  const adminSettings = await payload.findGlobal({
    slug: 'admin-settings',
    depth: 0,
  })

  const welcomeContent = adminSettings?.loginWelcomeContent

  return (
    <div>
      <div className="login__welcome" style={{ marginBottom: '1.5rem' }}>
        {welcomeContent?.root ? (
          <RichText data={welcomeContent as never} enableGutter={false} enableProse={true} />
        ) : (
          <p>
            <b>Welcome to your automations dashboards admin!</b>
          </p>
        )}
      </div>
    </div>
  )
}

export default BeforeLogin
