'use client'

import React, { useCallback } from 'react'
import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'

import { AgentSetupGuideModal } from './SetupGuideModal'
import { useAgentSetupGuide, type AgentSetupGuideRequest } from './useAgentSetupGuide'

import './index.scss'

const getFieldValue = (fields: Record<string, { value?: unknown }>, name: string): unknown =>
  fields[name]?.value

const getRelationID = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'value' in value) {
    return getRelationID((value as { value?: unknown }).value)
  }
  return undefined
}

export const AgentSetupGuideField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { closeGuide, loading, result, runGuide, syncWorkflows, syncingWorkflows } =
    useAgentSetupGuide({ mode: 'guide' })

  const formValues = useFormFields(([fields]) => ({
    endpointPath: getFieldValue(fields, 'endpointPath'),
    secretReference: getFieldValue(fields, 'secretReference'),
    server: getFieldValue(fields, 'server'),
    slug: getFieldValue(fields, 'slug'),
    transport: getFieldValue(fields, 'transport'),
    workflow: getFieldValue(fields, 'workflow'),
  }))

  const buildRequest = useCallback(
    (sync = false): AgentSetupGuideRequest => ({
      agentID: id ? String(id) : undefined,
      endpointPath: typeof formValues.endpointPath === 'string' ? formValues.endpointPath : undefined,
      secretReference:
        typeof formValues.secretReference === 'string' ? formValues.secretReference : undefined,
      serverID: getRelationID(formValues.server),
      slug: typeof formValues.slug === 'string' ? formValues.slug : undefined,
      syncWorkflows: sync,
      transport:
        formValues.transport === 'chat-trigger' || formValues.transport === 'webhook'
          ? formValues.transport
          : undefined,
      workflowID: getRelationID(formValues.workflow),
    }),
    [formValues, id],
  )

  const handleOpenGuide = useCallback(async () => {
    if (loading) {
      return
    }

    await runGuide(buildRequest(false))
  }, [buildRequest, loading, runGuide])

  const handleSyncWorkflows = useCallback(async () => {
    await syncWorkflows(buildRequest(true))
  }, [buildRequest, syncWorkflows])

  return (
    <div className="agentSetupGuide__field">
      <p className="agentSetupGuide__field-copy">
        Every agent needs a matching production workflow in n8n. Open the setup guide for env vars,
        webhook steps, sync checks, and Agent Chat block testing guidance.
      </p>
      <button
        className="agentSetupGuide__trigger"
        disabled={loading}
        onClick={handleOpenGuide}
        type="button"
      >
        {loading ? 'Loading setup guide…' : 'Open setup guide'}
      </button>
      {result ? (
        <AgentSetupGuideModal
          onClose={closeGuide}
          onSyncWorkflows={handleSyncWorkflows}
          result={result}
          syncingWorkflows={syncingWorkflows}
        />
      ) : null}
    </div>
  )
}
