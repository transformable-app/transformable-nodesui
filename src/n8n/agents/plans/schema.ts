export const AGENT_PLAN_MODES = ['sequential', 'dependency', 'manual'] as const
export const AGENT_PLAN_TASK_OUTPUT_TYPES = ['text', 'json', 'artifact', 'cms-draft'] as const
export const AGENT_PLAN_TASK_RISK_LEVELS = ['low', 'medium', 'high'] as const

export type AgentPlanMode = (typeof AGENT_PLAN_MODES)[number]
export type AgentPlanTaskOutputType = (typeof AGENT_PLAN_TASK_OUTPUT_TYPES)[number]
export type AgentPlanTaskRiskLevel = (typeof AGENT_PLAN_TASK_RISK_LEVELS)[number]

export type AgentPlanLimitsInput = {
  maxConcurrentTasks?: number
  maxIterations?: number
  maxTaskAttempts?: number
  timeoutMS?: number
}

export type NormalizedAgentPlanLimits = {
  maxConcurrentTasks: number
  maxIterations: number
  maxTaskAttempts: number
  timeoutMS: number
}

export type AgentPlanApprovalPolicy = {
  requireBeforeStart?: boolean
  requireBeforeWrite?: boolean
  requireOnRisk?: boolean
}

export type AgentPlanTaskInput = {
  dependsOn?: string[]
  expectedOutput?: {
    schema?: Record<string, unknown>
    type: AgentPlanTaskOutputType
  }
  id: string
  input?: Record<string, unknown>
  instructions: string
  requiresApproval?: boolean
  riskLevel?: AgentPlanTaskRiskLevel
  successCriteria?: string[]
  title: string
}

export type AgentPlanInput = {
  agent: string
  approvalPolicy?: AgentPlanApprovalPolicy
  context?: Record<string, unknown>
  limits?: AgentPlanLimitsInput
  mode: AgentPlanMode
  objective: string
  tasks: AgentPlanTaskInput[]
  title: string
}

export type NormalizedAgentPlanInput = Omit<AgentPlanInput, 'approvalPolicy' | 'limits' | 'tasks'> & {
  approvalPolicy: Required<AgentPlanApprovalPolicy>
  limits: NormalizedAgentPlanLimits
  tasks: Array<
    Omit<AgentPlanTaskInput, 'dependsOn' | 'requiresApproval' | 'riskLevel'> & {
      dependsOn: string[]
      maxAttempts: number
      requiresApproval: boolean
      riskLevel: AgentPlanTaskRiskLevel
    }
  >
}

export const AGENT_PLAN_LIMIT_DEFAULTS = {
  maxConcurrentTasks: 1,
  maxTaskAttempts: 2,
  timeoutMS: 120_000,
} as const

export const AGENT_PLAN_LIMIT_CAPS = {
  maxConcurrentTasks: 4,
  maxIterations: 100,
  maxTaskAttempts: 5,
  submittedPlanBytes: 1_048_576,
  taskInputBytes: 131_072,
  tasksPerPlan: 50,
  timeoutMS: 600_000,
} as const

export const AGENT_PLAN_DEFAULT_APPROVAL_POLICY: Required<AgentPlanApprovalPolicy> = {
  requireBeforeStart: false,
  requireBeforeWrite: true,
  requireOnRisk: true,
}

export const AGENT_PLAN_INPUT_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    agent: { minLength: 1, type: 'string' },
    approvalPolicy: {
      additionalProperties: false,
      properties: {
        requireBeforeStart: { type: 'boolean' },
        requireBeforeWrite: { type: 'boolean' },
        requireOnRisk: { type: 'boolean' },
      },
      type: 'object',
    },
    context: { type: 'object' },
    limits: {
      additionalProperties: false,
      properties: {
        maxConcurrentTasks: { maximum: AGENT_PLAN_LIMIT_CAPS.maxConcurrentTasks, minimum: 1, type: 'integer' },
        maxIterations: { maximum: AGENT_PLAN_LIMIT_CAPS.maxIterations, minimum: 1, type: 'integer' },
        maxTaskAttempts: { maximum: AGENT_PLAN_LIMIT_CAPS.maxTaskAttempts, minimum: 1, type: 'integer' },
        timeoutMS: { maximum: AGENT_PLAN_LIMIT_CAPS.timeoutMS, minimum: 1_000, type: 'integer' },
      },
      type: 'object',
    },
    mode: { enum: AGENT_PLAN_MODES, type: 'string' },
    objective: { minLength: 1, type: 'string' },
    tasks: {
      items: {
        additionalProperties: false,
        properties: {
          dependsOn: { items: { type: 'string' }, type: 'array' },
          expectedOutput: {
            additionalProperties: false,
            properties: {
              schema: { type: 'object' },
              type: { enum: AGENT_PLAN_TASK_OUTPUT_TYPES, type: 'string' },
            },
            required: ['type'],
            type: 'object',
          },
          id: { minLength: 1, type: 'string' },
          input: { type: 'object' },
          instructions: { minLength: 1, type: 'string' },
          requiresApproval: { type: 'boolean' },
          riskLevel: { enum: AGENT_PLAN_TASK_RISK_LEVELS, type: 'string' },
          successCriteria: { items: { type: 'string' }, type: 'array' },
          title: { minLength: 1, type: 'string' },
        },
        required: ['id', 'title', 'instructions'],
        type: 'object',
      },
      minItems: 1,
      type: 'array',
    },
    title: { minLength: 1, type: 'string' },
  },
  required: ['title', 'objective', 'mode', 'agent', 'tasks'],
  type: 'object',
} as const
