import type { Metadata } from 'next'

import { RenderParams } from '@/components/RenderParams'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React from 'react'

import { ForgotPasswordForm } from '@/components/forms/ForgotPasswordForm'
import { getCachedGlobal } from '@/utilities/getGlobals'
import type { Header as HeaderType } from '@/payload-types'
import { getMediaUrl } from '@/utilities/getMediaUrl'
import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'

export default async function ForgotPasswordPage() {
  const headerDataResult = await getCachedGlobal('header', 1)()
  const headerData = headerDataResult as HeaderType
  const logo =
    headerData?.logo && typeof headerData.logo === 'object' && 'url' in headerData.logo
      ? getMediaUrl(headerData.logo.url as string)
      : null
  const sidebarLabel = headerData.dashboardSidebarLabel || 'Dash'
  const sidebarText = headerData.dashboardSidebarText || 'Configurable'

  return (
    <article className="pb-8 pt-8 sm:pb-12 sm:pt-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:px-8">
        <section className="overflow-hidden rounded-2xl border bg-card shadow lg:w-[320px] lg:shrink-0">
          <div className="border-b p-6">
            <Link className="flex items-center gap-3" href="/">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border bg-background text-foreground">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={sidebarLabel} className="h-9 w-9 object-contain" src={logo} />
                ) : (
                  <LayoutDashboard className="h-6 w-6 text-primary" />
                )}
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{sidebarLabel}</p>
                {sidebarText ? (
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    {sidebarText}
                  </p>
                ) : null}
              </div>
            </Link>
          </div>
          <div className="space-y-3 p-6">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Secure access
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Forgot password
            </h1>
            <RenderParams messageClassName="!my-0 !bg-transparent !p-0 text-left text-sm text-muted-foreground" />
          </div>
        </section>

        <section className="min-w-0 flex-1 rounded-2xl border bg-card p-8 shadow sm:p-10">
          <div className="max-w-xl">
            <ForgotPasswordForm />
          </div>
        </section>
      </div>
    </article>
  )
}

export const metadata: Metadata = {
  description: 'Enter your email address to recover your password.',
  openGraph: mergeOpenGraph({
    title: 'Forgot Password',
    url: '/forgot-password',
  }),
  title: 'Forgot Password',
}
