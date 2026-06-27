export type SampleN8nWorkflow = {
  description: string
  endpointPath: string
  filename: string
  label: string
}

export const SAMPLE_N8N_WORKFLOWS: SampleN8nWorkflow[] = [
  {
    description: 'Canonical synchronous smoke test for the dashboard preset.',
    endpointPath: '/webhook/test-agent',
    filename: 'test-agent-webhook.json',
    label: 'Test Agent (sync)',
  },
  {
    description: 'Echoes harness input.text in the assistant response.',
    endpointPath: '/webhook/test-agent-echo',
    filename: 'test-agent-echo-webhook.json',
    label: 'Test Agent Echo',
  },
  {
    description: 'Returns waiting; complete the run with a manual Payload callback curl.',
    endpointPath: '/webhook/test-agent-async',
    filename: 'test-agent-async-waiting.json',
    label: 'Async Waiting',
  },
  {
    description: 'Returns waiting, then POSTs a completion callback to Payload.',
    endpointPath: '/webhook/test-agent-async-callback',
    filename: 'test-agent-async-callback.json',
    label: 'Async Callback',
  },
]

export const SAMPLE_N8N_WORKFLOW_FILENAMES = new Set(
  SAMPLE_N8N_WORKFLOWS.map((workflow) => workflow.filename),
)

export const getSampleWorkflowDownloadURL = (filename: string): string =>
  `/api/n8n/sample-workflows/${encodeURIComponent(filename)}`

export const getRecommendedSampleWorkflow = (
  endpointPath: string,
): SampleN8nWorkflow | undefined =>
  SAMPLE_N8N_WORKFLOWS.find((workflow) => workflow.endpointPath === endpointPath)
