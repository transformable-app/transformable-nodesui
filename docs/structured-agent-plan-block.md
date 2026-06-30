# Structured Agent Plan Block

## Objective

Add a structured input block that lets an authenticated user submit a complete plan to the agent harness. The plan contains all tasks, task dependencies, expected outputs, and execution policy inside one validated JSON object. Payload owns the plan, task state, loop control, approvals, audit, and artifacts. n8n still executes one agent invocation at a time through the existing agent runtime.

This is a companion to [n8n-agent-harness-plan.md](./n8n-agent-harness-plan.md), especially the structured task console, async jobs, automation, and pipeline extension sections. It should extend the current `agents`, `agent-sessions`, `agent-runs`, callback, reconciliation, approval, and evaluation surfaces instead of introducing a second workflow engine.

## User Experience

The first usable surface should be an `AgentPlanBlock` for dashboards:

- Select one enabled structured agent or pipeline-capable agent.
- Paste or build a plan object in a schema-aware editor.
- Validate the plan before execution.
- Start, pause, cancel, or resume the loop.
- Show each task as a row with status, dependencies, attempts, latest run, output preview, and approval state.
- Link every task attempt to its `agent-run`, n8n execution, messages, artifacts, and evaluation records when available.

The block is not a chat replacement. It is a work console for explicit, bounded task plans.

## Sample Workflows And Setup Guide

Structured plans need the same onboarding path as agents when the selected n8n workflow expects a specific task envelope, callback secret, artifact behavior, or output schema. Reuse the existing agent setup pattern instead of creating a separate support surface.

Implementation requirements:

- Add importable sample n8n workflows under `docs/n8n-workflows/` for plan execution once the runtime contract is implemented.
- Extend the existing `GET /api/n8n/sample-workflows` and `GET /api/n8n/sample-workflows/:filename` listing/download flow so plan samples can appear beside the current agent samples, with metadata that identifies them as plan-oriented.
- Add a setup guide modal for `AgentPlanBlock` or plan-capable agents if the block cannot infer that the selected agent/workflow is ready. The modal should follow the existing **Agents** setup guide pattern: checklist, recommended sample workflow, credential/env-var instructions, optional workflow sync, response example, and smoke-test payload.
- Prefer reusing the existing setup guide components/styles where possible. If the response shape diverges enough, add a plan-specific guide response type under the same admin setup-guide family rather than duplicating modal behavior.
- Document the samples in `docs/n8n-workflows/README.md` and link them from `agent-harness-testing.md`.

Minimum sample set:

| Sample | Purpose |
| --- | --- |
| Structured plan echo | Accepts one task invocation, reads `input.data.planID`, `taskID`, `instructions`, and `input`, then returns a JSON `output` and `summary`. |
| Dependency summary | Demonstrates a downstream task consuming direct dependency summaries and artifact references. |
| Waiting/callback plan task | Returns `waiting`, then posts a completion event to Payload using `requestID`. |
| Artifact-producing task | Returns artifact metadata/references without embedding file bodies in `sharedContext`. |

The first implementation can ship only the structured plan echo sample if scope is tight, but the setup guide should be designed to list multiple plan samples as they are added.

## Plan Envelope

The plan must be submitted as a single object. Every executable unit is defined in `tasks`; the loop is not allowed to invent new top-level tasks unless a future version explicitly enables a controlled expansion policy.

```ts
type AgentPlanInput = {
  title: string
  objective: string
  mode: 'sequential' | 'dependency' | 'manual'
  agent: string
  context?: Record<string, unknown>
  limits?: {
    maxIterations?: number
    maxConcurrentTasks?: number
    maxTaskAttempts?: number
    timeoutMS?: number
  }
  approvalPolicy?: {
    requireBeforeStart?: boolean
    requireBeforeWrite?: boolean
    requireOnRisk?: boolean
  }
  tasks: AgentPlanTask[]
}

type AgentPlanTask = {
  id: string
  title: string
  instructions: string
  dependsOn?: string[]
  input?: Record<string, unknown>
  expectedOutput?: {
    type: 'text' | 'json' | 'artifact' | 'cms-draft'
    schema?: Record<string, unknown>
  }
  successCriteria?: string[]
  riskLevel?: 'low' | 'medium' | 'high'
  requiresApproval?: boolean
}
```

Initial validation rules:

- `title`, `objective`, `agent`, and at least one task are required.
- Task `id` values must be unique, URL-safe strings.
- `dependsOn` must reference tasks in the same plan.
- Dependency graphs must be acyclic.
- `limits.maxIterations` and `limits.maxTaskAttempts` must have conservative defaults and hard server-side caps.
- `context` and task `input` must be bounded, JSON-serializable data. Do not accept raw secrets, arbitrary URLs, or unbounded file payloads.

## Recommended Limits

Use two layers of limits: default values applied when a plan omits `limits`, and hard caps enforced server-side even when the submitted plan asks for more. Admin-only overrides can be added later, but the first version should keep the same caps for every user role.

| Limit | Default | Hard cap | Notes |
| --- | ---: | ---: | --- |
| Tasks per plan | 10 | 50 | Keeps the initial block readable and avoids turning the plan into a workflow builder. |
| `maxIterations` | `tasks.length * 2` | 100 | Allows retries/reconciliation passes without unbounded loops. |
| `maxConcurrentTasks` | 1 | 4 | Start sequential by default; dependency mode can opt into limited parallel dispatch. |
| `maxTaskAttempts` | 2 | 5 | Count the first attempt plus retries. Approval resumes should not increment this by themselves. |
| Per-task timeout | 120 seconds | 10 minutes | Longer work should use async callback/reconciliation, not a held request. |
| Total plan runtime | 30 minutes | 2 hours | After this, mark the plan `blocked` or `timed-out` and require manual resume. |
| Submitted plan JSON | 256 KB | 1 MB | Reject before persistence. This excludes separately uploaded artifacts. |
| Per-task `input` | 32 KB | 128 KB | Larger inputs should be media/artifact references. |
| `sharedContext` | 64 KB | 256 KB | Store only small curated values needed by later tasks. |
| `outputPreview` | 8 KB | 32 KB | Redacted display text only. |
| `outputSummary` | 16 KB | 64 KB | Structured summary for downstream use, not the full output payload. |
| Artifacts per task | 5 | 20 | Large files, generated documents, exports, and media should be linked artifacts. |
| Artifact metadata | 8 KB | 32 KB | Store filenames, MIME types, checksums, sizes, and redacted descriptions, not file bodies. |
| Artifact retention | 30 days | 180 days | Allow shorter retention per agent or task type. |

Dependency outputs should be explicit by default. A downstream task should name the upstream task outputs it needs, and the runtime should pass summaries or artifact references rather than all prior outputs. If no explicit dependency output list exists in the first implementation, include only direct dependencies and only their `outputSummary`, `outputPreview`, and artifact references within the caps above.

## Execution Loop

Payload should run the loop as a managed state machine:

1. Create an `agent-plan` record and one `agent-plan-tasks` child record per submitted task.
2. Validate actor access to the selected agent with the same invoke rules used by normal agent runs.
3. Determine runnable tasks from `mode`, dependency completion, approval state, retry limits, and cancellation state.
4. For each runnable task, create one normal `agent-run` using the existing invocation envelope:

   ```ts
   type AgentInvocation = {
     requestID: string
     sessionID: string
     input: {
       text?: string
       data?: Record<string, unknown>
     }
     actor: {
       id: string
       roles: string[]
     }
     context?: Record<string, unknown>
   }
   ```

5. Include `planID`, `taskID`, task instructions, task input, objective, bounded shared context, and prior dependency outputs in `input.data`.
6. Let n8n execute the single task and return or callback with a normal structured response.
7. Validate the task output against `expectedOutput.schema` when present.
8. Mark the task `succeeded`, `failed`, `waiting`, `cancelled`, or `needs-approval`.
9. Repeat until all tasks are terminal, blocked, cancelled, or the plan reaches its iteration/time limits.

The loop must be resumable. A process restart should not lose state because the next job tick or reconciliation pass can inspect persisted plan/task/run state and continue from the last terminal boundary.

## Data Model

### `agent-plans`

Suggested fields:

- `title`, `objective`, `slug`
- `agent`: relationship to `agents`
- `session`: optional relationship to `agent-sessions`
- `createdBy`: relationship to `users`
- `status`: `draft`, `validating`, `queued`, `running`, `waiting`, `succeeded`, `failed`, `cancelled`, `blocked`
- `mode`: `sequential`, `dependency`, `manual`
- `submittedInput`: redacted copy of the validated plan object
- `sharedContext`: bounded JSON object for loop state
- `limits`, `approvalPolicy`
- `startedAt`, `finishedAt`, `lastRunAt`
- `summary`, `errorCode`, `errorMessage`

Access:

- Create/read/update should require authenticated users with invoke access to the selected agent.
- Non-admin users may read only their own plans.
- Admin can inspect all plans.
- Browser updates should not directly mutate execution-owned fields such as `status`, timestamps, run links, or summaries.

### `agent-plan-tasks`

Suggested fields:

- `plan`: relationship to `agent-plans`
- `taskID`: submitted task id, unique per plan
- `title`, `instructions`
- `dependsOn`: array of submitted task ids
- `status`: `pending`, `ready`, `running`, `waiting`, `needs-approval`, `succeeded`, `failed`, `cancelled`, `skipped`, `blocked`
- `attempts`, `maxAttempts`
- `latestRun`: relationship to `agent-runs`
- `runs`: optional relationship or reverse lookup to `agent-runs`
- `inputPreview`, `outputPreview`, `errorCode`, `errorMessage`
- `expectedOutput`, `successCriteria`, `riskLevel`, `requiresApproval`
- `startedAt`, `finishedAt`

Access should be derived through the parent plan. Do not trust user-submitted ownership or status values.

### `agent-runs`

Extend `agent-runs` only if needed:

- `plan`: optional relationship to `agent-plans`
- `planTask`: optional relationship to `agent-plan-tasks`
- `iteration`: number

Keep existing run status, callback, cancellation, n8n execution, preview, and feedback behavior.

## Server Components

Add a focused module under `src/n8n/agents/plans/`:

- `schema.ts`: plan input types, JSON Schema, defaults, and hard caps.
- `validatePlan.ts`: structural validation, dependency graph checks, and redaction.
- `createPlan.ts`: creates the plan and task records in one request transaction.
- `selectRunnableTasks.ts`: pure task selection for sequential/dependency/manual modes.
- `runPlanLoop.ts`: job-safe loop that creates normal `agent-runs`.
- `finalizeTask.ts`: validates outputs, updates task state, and decides whether to continue.
- `reconcilePlans.ts`: resumes interrupted plans and resolves stale running tasks from run state.

All nested Payload operations inside hooks or jobs should pass `req` when available. Use explicit context flags for any write-back path that could trigger the same hooks again.

## Endpoints

Prefer collection endpoints where the first path segment is an existing collection slug.

- `POST /api/agent-plans/validate` validates a plan without persisting it.
- `POST /api/agent-plans/start` creates a plan and enqueues the first loop pass.
- `POST /api/agent-plans/:id/pause` pauses future task dispatch.
- `POST /api/agent-plans/:id/resume` resumes a paused or blocked plan.
- `POST /api/agent-plans/:id/cancel` cancels the plan and active task run when possible.
- `GET /api/agent-plans/:id/tasks` returns task state for the block.

Every endpoint must authenticate the user, enforce plan ownership or Admin access, and avoid returning secrets or full raw n8n payloads.

## n8n Contract

n8n receives a single task per invocation. It should not receive the entire privileged plan state unless that task needs it.

Task invocation data should include:

- `requestID`
- `planID`
- `taskID`
- `objective`
- `instructions`
- `input`
- `dependencyOutputs`
- `actor`
- bounded `context`

n8n response data should include:

- `requestID`
- `status`: `succeeded`, `failed`, `waiting`, or `needs-approval`
- `output`
- optional `summary`
- optional `artifacts`
- optional `n8nExecutionID`
- optional `errorCode` and `errorMessage`

The callback route should continue to correlate by `requestID`; plan/task state can be resolved from the linked `agent-run`.

## Security And Safety

- Enforce agent invoke access with `overrideAccess: false` whenever a Local API call is made on behalf of a user.
- Never serialize server API keys, webhook credentials, or secret environment values to the block.
- Validate plan input server-side even when the UI validates it first.
- Treat n8n output as untrusted. Render text safely and validate structured output before using it.
- Use drafts and explicit approval for CMS write-back. Do not auto-publish generated content.
- Enforce the recommended defaults and hard caps for task count, input size, shared context, output previews, attempts, concurrent tasks, artifact metadata, and total plan runtime.
- Require approval for high-risk tasks, write-back tasks, external side effects, and any task whose agent declares an approval requirement.
- Persist redacted previews by default, not full prompts, tool payloads, credentials, or execution data.

## Delivery Plan

### Phase 1: Plan Schema And Validation

- Add `agent-plans` and `agent-plan-tasks` collection configs.
- Add plan input schema, defaults, dependency validation, and redaction helpers.
- Add validate/start endpoints.
- Define sample workflow metadata for plan-capable workflows so the setup guide can recommend the right n8n import later.
- Add unit tests for schema validation, cycle detection, limits, and redaction.
- Run `generate:types` after schema changes.

Exit: a valid structured plan can be persisted as a draft/queued plan with normalized task records, and invalid plans return actionable validation errors.

### Phase 2: Loop Runtime

- Add runnable-task selection for `sequential`, `dependency`, and `manual` modes.
- Add a Payload job task that dispatches runnable plan tasks through the existing agent invocation runtime.
- Link each task attempt to an `agent-run`.
- Finalize task state from synchronous responses and existing callback events.
- Add cancellation and retry behavior.

Exit: a plan with multiple dependent tasks can run to completion through normal n8n invocations and survive a process restart.

### Phase 3: Dashboard Block

- Add `AgentPlanBlock` with a small curated form for the initial `AgentPlanInput` shape, plus an advanced JSON view for inspection/debugging.
- Show task state, dependency state, attempts, latest output preview, and linked run/execution details.
- Add a setup guide modal when the selected plan agent/workflow is missing setup, sync, credentials, sample import, or response-shape confirmation. Reuse the current agent setup guide modal patterns and sample workflow download API where practical.
- Add at least one importable plan sample workflow under `docs/n8n-workflows/` and expose it through the sample workflow listing.
- Add polling or existing stream-compatible refresh behavior.
- Document the manual test flow, setup guide behavior, and plan sample import path in `agent-harness-testing.md`.
- Generate the import map after adding the block/admin components.

Exit: an authenticated user can submit and monitor a structured plan from a dashboard page without using curl, and a new operator can import a matching sample n8n workflow from the setup guide.

### Phase 4: Approvals, Artifacts, And Write-Back

- Integrate task-level approval records with the existing approval endpoints.
- Link returned artifacts to Payload media or a future `agent-artifacts` collection. Large files, generated documents, exports, or media should become artifacts linked from the task/run instead of being copied into `sharedContext`.
- Add optional draft-only CMS output bindings.
- Add evaluation run hooks for plan and task quality metrics.

Exit: high-risk or write-back tasks pause for explicit approval, and generated artifacts/drafts remain auditable from the plan.

### Future Phase: Controlled Task Expansion

- Allow agents to propose new tasks only after the fixed-plan loop is stable.
- Store proposed additions in a separate `proposedTasks` state, not directly in the runnable task graph.
- Validate proposed tasks against the same schema, limits, dependency rules, and access controls as submitted tasks.
- Require explicit user or Admin approval before proposed tasks become runnable.
- Preserve an audit trail that distinguishes the original submitted block from approved additions.

Exit: plans can grow through explicit approval without letting the agent silently rewrite the user's submitted task block.

## Open Decisions

### Decided

- `agent-plans` should be a standalone collection only. Plans may optionally link to an `agent-session` for related discussion or display history, but session state should not own plan execution. This keeps the plan loop, task graph, retries, approvals, and audit trail queryable without overloading chat/session semantics.
- Manual mode should approve only selected task transitions. A manual plan can still compute which tasks are ready, but dispatch pauses only at task boundaries marked by policy, risk, write-back behavior, or explicit `requiresApproval`. Users should not have to click start for every low-risk task.
- Large files, generated documents, exports, or media should become artifacts linked from the task/run instead of being copied into `sharedContext`.
- The first dashboard UI should use a small curated form for the initial `AgentPlanInput` shape. JSON Schema remains the server-side validation source of truth, but the first UX should optimize for this exact plan workflow instead of exposing a generic generated form as the primary interface.
- Controlled task expansion belongs in a future phase after fixed-block plan execution is reliable.
- Plan-capable workflows should have sample n8n imports and setup guide support when setup is not obvious from the selected agent/workflow.

### Still Open

- **Dependency output selection UI.** Store durable task outputs on the task record as bounded, redacted `outputPreview` plus structured `outputSummary`, and store only small cross-task values in `agent-plans.sharedContext`. The runtime default should pass only direct dependency summaries and artifact references. The remaining decision is how the curated form lets users explicitly select which upstream outputs each downstream task receives.
- **Future expansion policy.** Controlled task expansion is a future phase, but the policy still needs to define whether expansion is allowed per plan, per agent, or per role; whether inserted tasks can depend on completed tasks; and how approval should work for plans owned by non-admin users.
- **Curated form details.** The primary UI is a small curated `AgentPlanInput` form. Remaining details are field ordering, whether to include a raw JSON import/export panel, how dependency selection works as tasks are added, and whether an optional UI schema is useful later for labels, grouping, helper text, widgets, and collapsed sections.
- **Plan setup guide shape.** The setup guide should reuse the existing agent setup modal pattern, but the exact response type still needs to define plan-specific checks: selected agent supports structured input, workflow synced, sample imported, callback secret configured when required, output schema matched, artifact behavior supported, and smoke-test plan payload accepted.
