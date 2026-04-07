'use client'

import React, { Fragment, useCallback, useState } from 'react'
import { toast } from '@payloadcms/ui'

import './index.scss'

type SyncResponse = {
  error?: string
  ok?: boolean
  resources?: string[]
  syncedDocs?: number
  syncedRows?: number
  syncedTables?: number
}

const SuccessMessage = ({
  syncedDocs,
  syncedRows,
  syncedTables,
}: {
  syncedDocs?: number
  syncedRows?: number
  syncedTables?: number
}) => {
  return (
    <div>
      n8n sync completed.
      {' '}
      {syncedDocs ?? 0} docs, {syncedTables ?? 0} tables, {syncedRows ?? 0} rows synced.
    </div>
  )
}

export const SyncButton: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<SyncResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()

    if (loading) {
      toast.info('n8n sync is already running.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const syncRequest = fetch('/api/n8n/sync?resource=all', {
        credentials: 'include',
        method: 'POST',
      }).then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as SyncResponse

          if (!response.ok || !data.ok) {
            throw new Error(data.error || 'The n8n sync request failed.')
          }

          return data
        })

      await toast.promise(
        syncRequest,
        {
          loading: 'Syncing n8n data...',
          success: (data) => (
            <SuccessMessage
              syncedDocs={data.syncedDocs}
              syncedRows={data.syncedRows}
              syncedTables={data.syncedTables}
            />
          ),
          error: (err) => (err instanceof Error ? err.message : 'The n8n sync request failed.'),
        },
      )

      const result = await syncRequest
      setLastResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loading])

  return (
    <Fragment>
      <button className="syncButton" onClick={handleClick} type="button">
        {loading ? 'Syncing n8n data...' : 'Sync n8n data now'}
      </button>
      {lastResult?.ok ? (
        <span className="syncButton__meta">
          {' '}
          Last run synced {lastResult.syncedDocs ?? 0} docs and {lastResult.syncedRows ?? 0} rows.
        </span>
      ) : null}
      {error ? <span className="syncButton__meta"> Error: {error}</span> : null}
    </Fragment>
  )
}
