import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TEST_AGENT_ENDPOINT_PATH,
  matchTestWorkflow,
  normalizeEndpointPath,
  TEST_AGENT_N8N_RESPONSE_EXAMPLE,
  workflowMatchesEndpointPath,
} from '@/n8n/agents/testAgentSetup'
import {
  getRecommendedSampleWorkflow,
  getSampleWorkflowDownloadURL,
  SAMPLE_N8N_WORKFLOW_FILENAMES,
} from '@/n8n/agents/sampleWorkflows'

describe('test agent setup helpers', () => {
  it('normalizes endpoint paths', () => {
    expect(normalizeEndpointPath('webhook/test-agent')).toBe('/webhook/test-agent')
    expect(normalizeEndpointPath('/webhook/custom')).toBe('/webhook/custom')
    expect(normalizeEndpointPath('')).toBe(DEFAULT_TEST_AGENT_ENDPOINT_PATH)
  })

  it('matches workflows by webhook path in apiData', () => {
    const workflow = {
      apiData: {
        nodes: [
          {
            parameters: {
              path: 'test-agent',
            },
            type: 'n8n-nodes-base.webhook',
          },
        ],
      },
      id: 'wf-1',
      lastSeenAt: '2026-06-26T12:00:00.000Z',
      name: 'Other workflow',
    }

    expect(workflowMatchesEndpointPath(workflow, '/webhook/test-agent')).toBe(true)
  })

  it('prefers endpoint-path matches over name matches', () => {
    const match = matchTestWorkflow({
      endpointPath: '/webhook/test-agent',
      workflows: [
        {
          apiData: {},
          id: 'wf-name',
          lastSeenAt: '2026-06-26T13:00:00.000Z',
          name: 'Test Agent Workflow',
        },
        {
          apiData: {
            nodes: [{ parameters: { path: 'test-agent' }, type: 'n8n-nodes-base.webhook' }],
          },
          id: 'wf-path',
          lastSeenAt: '2026-06-26T12:00:00.000Z',
          name: 'Harness webhook',
        },
      ],
    })

    expect(match?.workflow.id).toBe('wf-path')
    expect(match?.matchReason).toBe('endpoint-path')
  })

  it('falls back to the most recently synced workflow with a warning', () => {
    const match = matchTestWorkflow({
      endpointPath: '/webhook/test-agent',
      workflows: [
        {
          apiData: {},
          id: 'wf-old',
          lastSeenAt: '2026-06-25T12:00:00.000Z',
          name: 'Older automation',
        },
        {
          apiData: {},
          id: 'wf-new',
          lastSeenAt: '2026-06-26T12:00:00.000Z',
          name: 'Newest automation',
        },
      ],
    })

    expect(match?.workflow.id).toBe('wf-new')
    expect(match?.matchReason).toBe('fallback-recent')
    expect(match?.warning).toContain('most recently synced')
  })

  it('documents the canonical n8n response example', () => {
    expect(TEST_AGENT_N8N_RESPONSE_EXAMPLE).toEqual({
      content: 'Harness response received',
      n8nExecutionID: 'manual-test-execution',
      status: 'succeeded',
    })
  })

  it('exposes sample workflow download metadata', () => {
    expect(SAMPLE_N8N_WORKFLOW_FILENAMES.has('test-agent-webhook.json')).toBe(true)
    expect(getSampleWorkflowDownloadURL('test-agent-webhook.json')).toBe(
      '/api/n8n/sample-workflows/test-agent-webhook.json',
    )
    expect(getRecommendedSampleWorkflow('/webhook/test-agent')?.filename).toBe(
      'test-agent-webhook.json',
    )
  })
})
