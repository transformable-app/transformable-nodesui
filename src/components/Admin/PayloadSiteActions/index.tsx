'use client'

import React, { useCallback, useState } from 'react'
import { toast, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'

import './index.scss'

type PayloadSiteActionResponse = {
  error?: string
  ok?: boolean
  payloadSite?: {
    schemaProfileHash?: string
    schemaProfileStatus?: string
  }
  profileHash?: string
  schemaProfileStatus?: string
}

const getFieldValue = (fields: Record<string, { value?: unknown }>, name: string): string | undefined => {
  const value = fields[name]?.value
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const PayloadSiteActionsField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const [checking, setChecking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const statuses = useFormFields(([fields]) => ({
    companionPluginStatus: getFieldValue(fields, 'companionPluginStatus'),
    schemaProfileHash: getFieldValue(fields, 'schemaProfileHash'),
    schemaProfileStatus: getFieldValue(fields, 'schemaProfileStatus'),
  }))

  const runAction = useCallback(
    async (action: 'check-companion-plugin' | 'sync-schema-profile') => {
      if (!id) {
        toast.error('Save this Payload Site before running setup actions.')
        return
      }

      const isSync = action === 'sync-schema-profile'
      if (isSync) setSyncing(true)
      else setChecking(true)

      try {
        const response = await fetch(`/api/payload-sites/${id}/${action}`, {
          credentials: 'include',
          method: 'POST',
        })
        const data = (await response.json().catch(() => ({}))) as PayloadSiteActionResponse

        if (!response.ok || data.ok === false) {
          throw new Error(data.error || 'Payload site setup action failed.')
        }

        const status = data.schemaProfileStatus || data.payloadSite?.schemaProfileStatus
        const hash = data.profileHash || data.payloadSite?.schemaProfileHash
        const message = isSync
          ? `Schema profile ${status || 'synced'}${hash ? ` (${hash.slice(0, 8)})` : ''}.`
          : 'Companion plugin check completed.'

        setLastResult(message)
        toast.success(message)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Payload site setup action failed.'
        setLastResult(message)
        toast.error(message)
      } finally {
        if (isSync) setSyncing(false)
        else setChecking(false)
      }
    },
    [id],
  )

  return (
    <div className="payloadSiteActions">
      <p className="payloadSiteActions__copy">
        Check the companion plugin, then sync the target site's schema profile before enabling
        write-back.
      </p>
      <div className="payloadSiteActions__actions">
        <button
          className="payloadSiteActions__button"
          disabled={checking || syncing}
          onClick={() => runAction('check-companion-plugin')}
          type="button"
        >
          {checking ? 'Checking companion plugin...' : 'Check companion plugin'}
        </button>
        <button
          className="payloadSiteActions__button"
          disabled={checking || syncing}
          onClick={() => runAction('sync-schema-profile')}
          type="button"
        >
          {syncing ? 'Syncing schema profile...' : 'Sync schema profile'}
        </button>
      </div>
      <span className="payloadSiteActions__meta">
        Companion: {statuses.companionPluginStatus || 'unsaved'} · Schema:{' '}
        {statuses.schemaProfileStatus || 'unsaved'}
        {statuses.schemaProfileHash ? ` · ${statuses.schemaProfileHash.slice(0, 8)}` : ''}
      </span>
      {lastResult ? <span className="payloadSiteActions__meta">{lastResult}</span> : null}
    </div>
  )
}
