import type { Metadata } from 'next'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { AccountForm } from '@/components/forms/AccountForm'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'

export default async function AccountPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(
      `/login?warning=${encodeURIComponent('Please login to access your account settings.')}`,
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card p-8 shadow sm:p-10">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Your profile
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Account
        </h1>
        <p className="text-lg leading-8 text-muted-foreground">
          Update your profile details or change your password.
        </p>
      </div>

      <div className="mt-10 rounded-xl border bg-background p-6 sm:p-8">
        <AccountForm />
      </div>
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Create an account or log in to your existing account.',
  openGraph: mergeOpenGraph({
    title: 'Account',
    url: '/account',
  }),
  title: 'Account',
}
