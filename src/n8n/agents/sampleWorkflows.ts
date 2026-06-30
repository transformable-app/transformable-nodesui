export type SampleN8nWorkflow = {
  category?: 'agent-chat' | 'agent-plan'
  description: string
  endpointPath: string
  filename: string
  label: string
}

/** Default sample for the dashboard test-agent preset and Agent Chat block smoke tests. */
export const DEFAULT_AGENT_CHAT_SAMPLE_WORKFLOW: SampleN8nWorkflow = {
  category: 'agent-chat',
  description:
    'Webhook + AI Agent workflow for the Agent Chat block. Includes OpenAI Chat Model, memory, a placeholder Calculator tool, and harness response shaping.',
  endpointPath: '/webhook/test-agent',
  filename: 'test-agent-webhook.json',
  label: 'Agent Chat (Webhook)',
}

/** @deprecated Use DEFAULT_AGENT_CHAT_SAMPLE_WORKFLOW */
export const AGENT_CHAT_SAMPLE_WORKFLOW = DEFAULT_AGENT_CHAT_SAMPLE_WORKFLOW

/** Synchronous chat samples for the Agent Chat block. */
export const AGENT_CHAT_SAMPLE_WORKFLOWS: SampleN8nWorkflow[] = [
  DEFAULT_AGENT_CHAT_SAMPLE_WORKFLOW,
  {
    category: 'agent-chat',
    description: 'Echoes harness input.text in the assistant response.',
    endpointPath: '/webhook/test-agent-echo',
    filename: 'test-agent-echo-webhook.json',
    label: 'Agent Chat Echo (Webhook)',
  },
]

const ASYNC_SAMPLE_WORKFLOWS: SampleN8nWorkflow[] = [
  {
    category: 'agent-chat',
    description:
      'Returns waiting; complete the run with a manual Payload callback curl. Requires N8N_CALLBACK_SECRET.',
    endpointPath: '/webhook/test-agent-async',
    filename: 'test-agent-async-waiting.json',
    label: 'Async Waiting (Webhook)',
  },
  {
    category: 'agent-chat',
    description:
      'Returns waiting, then POSTs a completion callback to Payload. Requires N8N_CALLBACK_SECRET and PAYLOAD_PUBLIC_URL on the n8n host.',
    endpointPath: '/webhook/test-agent-async-callback',
    filename: 'test-agent-async-callback.json',
    label: 'Async Callback (Webhook)',
  },
]

export const AGENT_PLAN_SAMPLE_WORKFLOWS: SampleN8nWorkflow[] = [
  {
    category: 'agent-plan',
    description:
      'Accepts one structured plan task invocation and echoes the task output summary for AgentPlanBlock smoke tests.',
    endpointPath: '/webhook/structured-plan-echo',
    filename: 'structured-plan-echo.json',
    label: 'Structured Plan Echo (Webhook)',
  },
]

export const SAMPLE_N8N_WORKFLOWS: SampleN8nWorkflow[] = [
  ...AGENT_CHAT_SAMPLE_WORKFLOWS,
  ...ASYNC_SAMPLE_WORKFLOWS,
  ...AGENT_PLAN_SAMPLE_WORKFLOWS,
]

/** All importable samples shown in the admin setup guide modal. */
export const SETUP_GUIDE_SAMPLE_WORKFLOWS = SAMPLE_N8N_WORKFLOWS

export const SAMPLE_N8N_WORKFLOW_FILENAMES = new Set(
  SAMPLE_N8N_WORKFLOWS.map((workflow) => workflow.filename),
)

export const getSampleWorkflowDownloadURL = (filename: string): string =>
  `/api/n8n/sample-workflows/${encodeURIComponent(filename)}`

export const getRecommendedSampleWorkflow = (
  endpointPath: string,
): SampleN8nWorkflow | undefined =>
  SAMPLE_N8N_WORKFLOWS.find((workflow) => workflow.endpointPath === endpointPath)
