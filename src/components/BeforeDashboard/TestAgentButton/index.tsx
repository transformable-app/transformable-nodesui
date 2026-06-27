'use client'

import React, { useCallback } from 'react'
import { toast, useAuth } from '@payloadcms/ui'

import { AgentSetupGuideModal } from '@/components/Admin/AgentSetupGuide/SetupGuideModal'
import { useAgentSetupGuide } from '@/components/Admin/AgentSetupGuide/useAgentSetupGuide'

import '@/components/Admin/AgentSetupGuide/index.scss'

export const TestAgentButton: React.FC = () => {
  const { user } = useAuth()
  const { closeGuide, loading, result, runGuide, syncWorkflows, syncingWorkflows } =
    useAgentSetupGuide({ mode: 'test-setup' })

  const handleClick = useCallback(async () => {
    if (loading) {
      toast.info('Test agent setup is already running.')
      return
    }

    await runGuide({})
  }, [loading, runGuide])

  const handleSyncWorkflows = useCallback(async () => {
    await syncWorkflows({})
  }, [syncWorkflows])

  if (!user?.roleNames?.some((name: string) => name.toLowerCase() === 'admin')) {
    return null
  }

  return (
    <>
      <button
        className="agentSetupGuide__dashboard-trigger"
        disabled={loading}
        onClick={handleClick}
        type="button"
      >
        {loading ? 'Setting up test agent…' : 'Set up test agent'}
      </button>
      {result ? (
        <AgentSetupGuideModal
          onClose={closeGuide}
          onSyncWorkflows={handleSyncWorkflows}
          result={result}
          syncingWorkflows={syncingWorkflows}
        />
      ) : null}
    </>
  )
}
