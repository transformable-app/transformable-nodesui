'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * When editing the admin-settings global, poll for changes and refresh the router
 * so the nav logo updates (e.g. when the user removes the logo and saves).
 */
export function AdminSettingsRefreshProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const lastUpdatedAt = useRef<string | null>(null)

  useEffect(() => {
    const isAdminSettingsGlobal = pathname?.includes('/globals/admin-settings')
    if (!isAdminSettingsGlobal) return

    const poll = async () => {
      try {
        const res = await fetch('/api/globals/admin-settings?depth=0', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        const updatedAt = data?.updatedAt ?? null
        if (lastUpdatedAt.current !== null && lastUpdatedAt.current !== updatedAt) {
          router.refresh()
        }
        lastUpdatedAt.current = updatedAt
      } catch {
        // ignore
      }
    }

    const id = setInterval(poll, 2000)
    poll()

    return () => clearInterval(id)
  }, [pathname, router])

  return <>{children}</>
}
