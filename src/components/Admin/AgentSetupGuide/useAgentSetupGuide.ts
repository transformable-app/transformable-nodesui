'use client'

import { useCallback, useState } from 'react'
import { toast } from '@payloadcms/ui'

import type { AgentSetupGuideResponse } from '@/n8n/agents/testAgentSetup'

export type AgentSetupGuideRequest = {
  agentID?: string
  endpointPath?: string
  secretReference?: string
  serverID?: string
  slug?: string
  syncWorkflows?: boolean
  transport?: 'chat-trigger' | 'webhook'
  workflowID?: string
}

type SetupGuideMode = 'guide' | 'test-setup'

const getSetupURL = (mode: SetupGuideMode, agentID?: string) => {
  if (mode === 'test-setup') return '/api/agents/test-setup'
  if (agentID) return `/api/agents/${agentID}/setup-guide`
  return '/api/agents/setup-guide'
}

export const useAgentSetupGuide = ({
  mode = 'guide',
}: {
  mode?: SetupGuideMode
} = {}) => {
  const [loading, setLoading] = useState(false)
  const [syncingWorkflows, setSyncingWorkflows] = useState(false)
  const [result, setResult] = useState<AgentSetupGuideResponse | null>(null)

  const runGuide = useCallback(
    async (request: AgentSetupGuideRequest = {}) => {
      setLoading(true)

      try {
        const response = await fetch(getSetupURL(mode, request.agentID), {
          body: JSON.stringify(request),
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
        })

        const data = (await response.json().catch(() => null)) as AgentSetupGuideResponse | null

        if (!response.ok || !data) {
          throw new Error(
            data && 'message' in data && typeof data.message === 'string'
              ? data.message
              : 'The agent setup guide request failed.',
          )
        }

        setResult(data)

        if (data.ok && data.checks.agentOK && data.checks.workflowOK && data.checks.invocationSecretOK) {
          toast.success(data.message)
        } else {
          toast.info(data.message)
        }

        return data
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The agent setup guide request failed.')
        return null
      } finally {
        setLoading(false)
      }
    },
    [mode],
  )

  const syncWorkflows = useCallback(
    async (request: AgentSetupGuideRequest = {}) => {
      if (syncingWorkflows) return null

      setSyncingWorkflows(true)

      try {
        const data = await runGuide({ ...request, syncWorkflows: true })
        if (data?.syncWorkflows?.ok) {
          toast.success(`Synced ${data.syncWorkflows.syncedDocs ?? 0} workflows.`)
        } else if (data?.syncWorkflows && !data.syncWorkflows.ok) {
          toast.error('Workflow sync failed. Check server credentials and try again.')
        }
        return data
      } finally {
        setSyncingWorkflows(false)
      }
    },
    [runGuide, syncingWorkflows],
  )

  const closeGuide = useCallback(() => {
    setResult(null)
  }, [])

  return {
    closeGuide,
    loading,
    result,
    runGuide,
    syncWorkflows,
    syncingWorkflows: syncingWorkflows || loading,
  }
}
