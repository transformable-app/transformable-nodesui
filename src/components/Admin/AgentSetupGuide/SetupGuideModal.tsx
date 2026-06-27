'use client'

import React from 'react'
import { Button, CopyToClipboard } from '@payloadcms/ui'

import {
  buildSmokeTestSnippet,
  type AgentSetupGuideResponse,
} from '@/n8n/agents/testAgentSetup'
import {
  getRecommendedSampleWorkflow,
  getSampleWorkflowDownloadURL,
  SAMPLE_N8N_WORKFLOWS,
} from '@/n8n/agents/sampleWorkflows'

import './index.scss'

const ChecklistItem = ({
  detail,
  ok,
  title,
}: {
  detail?: string
  ok: boolean
  title: string
}) => (
  <li className={`agentSetupGuide__checklist-item ${ok ? 'is-ok' : 'is-pending'}`}>
    <span aria-hidden="true" className="agentSetupGuide__checklist-icon">
      {ok ? '✓' : '○'}
    </span>
    <div>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  </li>
)

const getTransportLabel = (transport: AgentSetupGuideResponse['instructions']['transport']) =>
  transport === 'chat-trigger' ? 'Chat Trigger' : 'Webhook'

export const AgentSetupGuideModal = ({
  onClose,
  onSyncWorkflows,
  result,
  syncingWorkflows,
}: {
  onClose: () => void
  onSyncWorkflows: () => void
  result: AgentSetupGuideResponse
  syncingWorkflows: boolean
}) => {
  const responseExample = JSON.stringify(result.instructions.n8nResponseExample, null, 2)
  const smokeTestSnippet = buildSmokeTestSnippet(result.agent?.slug || 'your-agent-slug')
  const title =
    result.mode === 'test-setup' ? 'Test agent setup' : `Setup guide${result.agent?.name ? `: ${result.agent.name}` : ''}`
  const transportLabel = getTransportLabel(result.instructions.transport)
  const recommendedWorkflow = getRecommendedSampleWorkflow(result.instructions.n8nWebhookPath)
  const agentRecordDetail = result.agent?.id
    ? 'This agent record is saved in Payload.'
    : result.agent?.slug
      ? 'Fill in and save the agent record, or continue configuring n8n first.'
      : 'Save the agent with a slug, server, workflow, and endpoint path.'

  return (
    <div
      className="agentSetupGuide__modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-setup-guide-title"
    >
      <div className="agentSetupGuide__modal-backdrop" onClick={onClose} />
      <div className="agentSetupGuide__modal-panel">
        <div className="agentSetupGuide__modal-header">
          <h3 id="agent-setup-guide-title">{title}</h3>
          <button
            aria-label="Close setup guide"
            className="agentSetupGuide__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <p className="agentSetupGuide__message">{result.message}</p>

        {result.server ? (
          <p className="agentSetupGuide__meta">
            Server: <strong>{result.server.name}</strong>
            {result.workflow ? (
              <>
                {' '}
                · Workflow: <strong>{result.workflow.name}</strong>
              </>
            ) : null}
          </p>
        ) : null}

        {result.workflowMatchWarning ? (
          <p className="agentSetupGuide__warning">{result.workflowMatchWarning}</p>
        ) : null}

        <ol className="agentSetupGuide__checklist">
          <ChecklistItem
            detail={`${result.instructions.secretReference}: ${result.checks.invocationSecretOK ? 'set' : 'missing'}. N8N_CALLBACK_SECRET: ${result.checks.callbackSecretOK ? 'set' : 'missing (optional unless testing async callbacks)'}.`}
            ok={result.checks.invocationSecretOK}
            title="Environment variables"
          />
          <ChecklistItem
            detail={`Import a sample workflow below or create a production ${transportLabel} at ${result.instructions.n8nWebhookPath} with auth matching ${result.instructions.secretReference}, then activate the workflow in n8n.`}
            ok={result.checks.workflowOK}
            title={`n8n ${transportLabel.toLowerCase()} workflow`}
          />
          <ChecklistItem
            detail="Run Sync n8n data now on the dashboard, or sync workflows from this panel."
            ok={Boolean(result.workflow)}
            title="Sync workflows into Payload"
          />
          <ChecklistItem detail={agentRecordDetail} ok={result.checks.agentOK} title="Payload agent record" />
        </ol>

        <section className="agentSetupGuide__samples">
          <div className="agentSetupGuide__example-header">
            <strong>Sample n8n workflows</strong>
          </div>
          <p className="agentSetupGuide__samples-intro">
            Download JSON, import into n8n, attach Header Auth (<code>Authorization: Bearer …</code>
            ), publish, then sync workflows.
            {recommendedWorkflow ? (
              <>
                {' '}
                Recommended for this agent:{' '}
                <strong>{recommendedWorkflow.label}</strong> ({recommendedWorkflow.endpointPath}).
              </>
            ) : null}
          </p>
          <ul className="agentSetupGuide__samples-list">
            {SAMPLE_N8N_WORKFLOWS.map((workflow) => {
              const downloadURL = getSampleWorkflowDownloadURL(workflow.filename)
              const isRecommended = workflow.filename === recommendedWorkflow?.filename

              return (
                <li
                  className={`agentSetupGuide__samples-item${isRecommended ? ' is-recommended' : ''}`}
                  key={workflow.filename}
                >
                  <div className="agentSetupGuide__samples-copy">
                    <strong>{workflow.label}</strong>
                    <span className="agentSetupGuide__samples-path">{workflow.endpointPath}</span>
                    <p>{workflow.description}</p>
                  </div>
                  <div className="agentSetupGuide__samples-actions">
                    <a
                      className={`agentSetupGuide__samples-download${isRecommended ? ' is-primary' : ''}`}
                      download={workflow.filename}
                      href={downloadURL}
                    >
                      Download
                    </a>
                    <a
                      className="agentSetupGuide__samples-link"
                      download={workflow.filename}
                      href={downloadURL}
                    >
                      {workflow.filename}
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="agentSetupGuide__example">
          <div className="agentSetupGuide__example-header">
            <strong>n8n response example</strong>
            <CopyToClipboard value={responseExample} />
          </div>
          <pre>{responseExample}</pre>
        </div>

        <details className="agentSetupGuide__smoke-test">
          <summary>Run smoke test in browser console</summary>
          <div className="agentSetupGuide__example-header">
            <span>Copy into the admin browser console after the checklist is complete.</span>
            <CopyToClipboard value={smokeTestSnippet} />
          </div>
          <pre>{smokeTestSnippet}</pre>
        </details>

        <div className="agentSetupGuide__modal-actions">
          <Button
            buttonStyle="secondary"
            disabled={syncingWorkflows}
            onClick={onSyncWorkflows}
            size="small"
            type="button"
          >
            {syncingWorkflows ? 'Syncing workflows…' : 'Sync workflows first'}
          </Button>
          {result.agent?.adminURL ? (
            <Button buttonStyle="primary" el="anchor" size="small" url={result.agent.adminURL}>
              Open agent record
            </Button>
          ) : null}
          <Button buttonStyle="secondary" onClick={onClose} size="small" type="button">
            Close
          </Button>
        </div>

        <p className="agentSetupGuide__help">
          Workflow source files: <code>docs/n8n-workflows/</code>. List API:{' '}
          <a href="/api/n8n/sample-workflows">/api/n8n/sample-workflows</a>. Full manual steps:{' '}
          <code>docs/agent-harness-testing.md</code>.
        </p>
      </div>
    </div>
  )
}
