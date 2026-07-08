# Structured Agent Plan Block

## Objective

Add a structured input block that lets an authenticated user submit a complete plan to the agent harness. The plan contains all tasks, task dependencies, expected outputs, and execution policy inside one validated JSON object. This NodesUI Payload install owns the plan, task state, loop control, approvals, audit, and artifacts. n8n still executes one agent invocation at a time through the existing agent runtime. CMS write-back is not limited to this Payload install: page and media generation targets configured external Payload websites through their Payload APIs, so one NodesUI instance can orchestrate agents for multiple Payload sites.

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
  payloadSite?: string
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

## External Payload Site Targets

Generated CMS content should target a configured Payload website, not implicitly write into the current NodesUI install. NodesUI is the control plane for plans, write-back validation, approvals, and audit; target Payload websites remain the content systems of record. n8n workflows may read target Payload sites directly through those sites' Payload REST APIs when they use scoped, read-only Payload API key credentials configured in n8n.

Add a `payload-sites` collection or equivalent configuration surface with:

- `name`, `slug`, `description`, `enabled`
- `baseURL`: trusted origin for the target Payload REST API
- `adminURL`: optional editor/admin link root for review links
- `apiKeyAuthCollection`: auth collection slug for Payload API key authentication, defaulting to `users`
- `apiKeySecretReference`: environment or secret-manager reference for that site's Payload API key, never the API key value itself
- `n8nReadAPIKeySecretReference`: optional reference/name for a separate read-only target-site API key credential managed in n8n
- `companionPluginStatus`: `missing`, `connected`, `stale`, or `error`
- `allowedCollections`: allowlist of writable collection slugs, initially focused on `pages` and `media`
- `readableCollections`: allowlist of collection slugs that n8n agents may read directly through the target site's Payload API
- `capabilities`: discovered from the companion plugin, including support for drafts, versions, uploads, locales, tenants, block slugs, and required plugins
- `schemaProfileEndpoint`: relative API path exposed by the companion plugin, defaulting to `/api/nodesui/schema-profile`
- `schemaProfile`, `schemaProfileHash`, `schemaProfileSyncedAt`, and `schemaProfileStatus`
- `allowedRoles`: which NodesUI roles may generate drafts for this site
- `fieldAllowlists`: per-collection paths that the draft writer may set
- `mediaPolicy`: allowed MIME types, size caps, image generation/import behavior, and retention rules for temporary artifacts

NodesUI should never assume the target schema matches its own `pages` collection. The target site must have the NodesUI companion plugin installed and connected before a plan can write drafts.

## Direct Payload API Reads From n8n

n8n agents may use normal HTTP Request or AI tool nodes to read approved target Payload site collections directly. This is intentionally different from write-back:

- Reads may happen inside n8n using the target site's Payload REST API and a read-only Payload API key credential stored in n8n.
- Writes still return an intent envelope to NodesUI. NodesUI validates generated output, writes drafts through its server-side Payload API client, records provenance, and requires explicit approval before publish.
- The target Payload site is responsible for enforcing collection and field access for the read-only API key user. Use a dedicated user/API key, not the same credential used for draft writes.
- n8n workflow prompts and tool descriptions must constrain reads to the site's `readableCollections` and avoid broad, user-controlled queries.
- Direct n8n reads do not create NodesUI per-query audit records by default. The audit source is the n8n execution plus any logs on the target Payload site. If per-query audit becomes a requirement, add a NodesUI-mediated read endpoint later.

Recommended direct-read tool contract for n8n:

```ts
type PayloadSiteReadToolInput = {
  collection: string
  id?: string
  where?: Record<string, unknown>
  select?: Record<string, true>
  depth?: number
  limit?: number
  sort?: string
}
```

Recommended caps for n8n tools:

- `depth`: default `0`, hard cap `2`
- `limit`: default `10`, hard cap `50`
- `select`: prefer explicit fields instead of full documents
- `where`: allow simple read-oriented filters only; avoid arbitrary agent-generated operators until the workflow is trusted
- API key: read-only, collection-restricted, and separate from write-back credentials

## Schema Profile Sync

NodesUI should automatically save a target site's page schema profile through a required companion plugin installed in that target Payload site. Payload's generated REST API exposes collection/global document operations; it does not, by itself, provide the full Payload config needed to safely generate block payloads. GraphQL introspection is not part of the supported path because it can be disabled in production and does not capture enough generation policy.

The companion plugin exposes a sanitized endpoint, for example `GET /api/nodesui/schema-profile`, authenticated by the same Payload API key. It returns only generation-safe metadata:

- companion plugin version and compatibility range
- writable collections and upload collections
- draft/version support
- locale and tenant support
- block slugs, field paths, relationship/upload targets, enum options, required fields, max/min constraints, labels/descriptions, and admin descriptions
- media/upload policy hints
- preview/admin URL helpers or templates when available
- schema hash/version

Add NodesUI endpoints/actions:

- `POST /api/payload-sites/:id/sync-schema-profile`: fetches the target site's profile using Payload API key auth, validates it, stores it on `payload-sites`, and records `schemaProfileHash` plus `schemaProfileSyncedAt`.
- `POST /api/payload-sites/:id/check-companion-plugin`: verifies the companion endpoint is reachable, authenticated, and compatible.
- `GET /api/payload-sites/:id/schema-profile`: returns the saved profile to Admin UI users with secrets removed.

Schema profile sync should be explicit or scheduled, not performed on every generation run. If the target site's returned hash changes, mark the site as `schema-stale` and require review before additional CMS write-back unless the change is classified as non-breaking. If the companion plugin is missing, incompatible, or failing, NodesUI must block CMS write-back for that site.

## Remote CMS Draft Contract

For `cms-draft` tasks, n8n returns an intent envelope. NodesUI validates the envelope, resolves artifacts, and calls the selected target Payload API using the target site's configured write-back Payload API key. Agents may hold a separate read-only target-site API credential in n8n for retrieval, but they should not hold write-capable credentials or write freely to any collection.

```ts
type CMSDraftOutput = {
  target: {
    payloadSite: string
    collection: string
    operation: 'create' | 'update'
    id?: string
    locale?: string
    tenant?: string
  }
  document: Record<string, unknown>
  mediaRequests?: Array<{
    id: string
    purpose: 'block-asset' | 'seo-image' | 'download' | 'inline'
    artifactID?: string
    sourceURL?: string
    prompt?: string
    alt: string
    caption?: string
    targetFieldPath: string
  }>
}
```

Validation and write-back rules:

- Resolve `target.payloadSite` against a readable/enabled `payload-sites` record and enforce role access before making any remote API call.
- Require `target.collection` to be in the site's `allowedCollections`.
- Validate `document` against the site's configured schema profile and field allowlist.
- For page generation, validate every block by `blockType` against the target site's allowed block registry, not the local NodesUI block registry.
- Create or update remote documents as drafts only when the target collection supports drafts. If drafts are unavailable, block write-back unless the site has an explicit non-draft staging strategy.
- Upload or attach media through the target site's upload API so final block fields reference media IDs from that target Payload instance, not local NodesUI media IDs.
- Store only provenance in NodesUI: target site, collection, remote document ID, remote draft/version ID when available, remote admin/preview URLs, source plan/task/run IDs, and artifact references.

## Multi-Site Media Handling

Media assets generated for blocks should move through NodesUI as controlled artifacts and land in the target Payload site's `media` collection or configured upload collection.

- n8n may return generated file artifacts, temporary signed URLs, or structured media instructions.
- NodesUI imports the asset server-side, validates MIME type/size, stores a local `agent-artifact` record for provenance, and uploads the final file to the target Payload API.
- The remote upload response supplies the ID that is inserted into the generated document.
- Alt text and captions are required by policy even if the target site does not require them yet.
- Local NodesUI `media` documents are optional cache/provenance objects only; they are not the canonical asset for external sites.
- Any fetch-back from a URL must use the same SSRF-safe URL handling as n8n endpoint construction: trusted protocols, no credentials in URLs, no internal hosts unless explicitly allowlisted, size caps, redirect controls, and content-type validation.

## Payload API Client Module

Add a focused module for remote Payload operations:

- `src/payloadSites/types.ts`: site config, capabilities, block schema profile, and draft output types.
- `src/payloadSites/buildEndpoint.ts`: SSRF-safe API URL builder using a trusted site base URL plus normalized API paths.
- `src/payloadSites/auth.ts`: resolves the site's Payload API key secret reference server-side and builds the Payload API key auth header for the configured auth collection.
- `src/payloadSites/client.ts`: typed REST helpers for find, create draft, update draft, upload media, and fetch preview/admin URLs.
- `src/payloadSites/schemaProfile.ts`: fetches, validates, normalizes, hashes, and stores target-site schema profiles.
- `src/payloadSites/companionPlugin.ts`: checks companion plugin connectivity, version compatibility, schema-profile support, and write-back readiness.
- `src/n8n/agents/plans/cmsDraftWriter.ts`: takes a validated `CMSDraftOutput`, performs media import/upload, writes the remote draft, and records provenance.

Remote Payload API calls are not Local API calls, so `overrideAccess` does not apply to the target site. Access is enforced by the target site's Payload API key user and by NodesUI's site/collection/field allowlists before the request is sent. All NodesUI persistence around plans, runs, approvals, and artifacts still uses the normal Local API safety rules.

## Security And Safety

- Enforce agent invoke access with `overrideAccess: false` whenever a Local API call is made on behalf of a user.
- Never serialize server API keys, webhook credentials, or secret environment values to the block.
- Validate plan input server-side even when the UI validates it first.
- Treat n8n output as untrusted. Render text safely and validate structured output before using it.
- Use drafts and explicit approval for CMS write-back. NodesUI writes generated content as a target-site draft first; explicit approval publishes that remote draft in the target Payload site.
- Do not write generated CMS content into the current NodesUI install unless it is explicitly registered as a `payload-sites` target and passes the same API-client path as every other site.
- Keep write-capable target Payload API keys server-side in NodesUI and scoped per site. Use a restricted target-site API key user that can create/update drafts and upload media only for allowed collections.
- If n8n reads target Payload APIs directly, use a separate read-only target-site API key credential in n8n. Restrict that user at the target Payload site to approved collections and fields wherever possible.
- Validate target site, collection, block type, field paths, locale, tenant, remote document ID, media references, and file metadata before remote writes.
- Record every remote write attempt with plan, task, run, target site, remote collection, remote document/version IDs, actor, timestamp, status, and redacted error details.
- Enforce the recommended defaults and hard caps for task count, input size, shared context, output previews, attempts, concurrent tasks, artifact metadata, and total plan runtime.
- Require approval for high-risk tasks, write-back tasks, external side effects, and any task whose agent declares an approval requirement.
- Persist redacted previews by default, not full prompts, tool payloads, credentials, or execution data.

## Delivery Plan

### Phase 1: Plan Schema And Validation

- Add `agent-plans` and `agent-plan-tasks` collection configs.
- Add plan input schema, defaults, dependency validation, optional `payloadSite` targeting, and redaction helpers.
- Add `payload-sites` configuration with role access, trusted base URL, write-back Payload API key secret reference, optional n8n read API key credential reference/name, auth collection slug, companion plugin status, writable/readable collection allowlists, media policy, and saved schema profile fields.
- Add schema-profile sync and compatibility checks through the required target-site companion plugin.
- Add validate/start endpoints.
- Define sample workflow metadata for plan-capable workflows so the setup guide can recommend the right n8n import later.
- Add unit tests for schema validation, cycle detection, limits, target-site access, allowlists, and redaction.
- Run `generate:types` after schema changes.

Exit: a valid structured plan can be persisted as a draft/queued plan with normalized task records and a valid target Payload site when CMS output is requested. Invalid plans return actionable validation errors before any n8n or remote Payload call.

### Phase 2: Loop Runtime

- Add runnable-task selection for `sequential`, `dependency`, and `manual` modes.
- Add a Payload job task that dispatches runnable plan tasks through the existing agent invocation runtime.
- Link each task attempt to an `agent-run`.
- Finalize task state from synchronous responses and existing callback events.
- Add cancellation and retry behavior.

Exit: a plan with multiple dependent tasks can run to completion through normal n8n invocations and survive a process restart.

### Phase 3: Dashboard Block

- Add `AgentPlanBlock` with a small curated form for the initial `AgentPlanInput` shape, plus an advanced JSON view for inspection/debugging.
- Add target Payload site selection for CMS-generation plans, filtered by the current user's NodesUI role and the selected agent's capabilities.
- Show selected site capabilities, schema profile status, allowed collections, supported blocks, media policy, and draft support before submission.
- Add Admin controls on `payload-sites` for "Check companion plugin", "Sync schema profile", "Review profile changes", and "Enable write-back".
- Show task state, dependency state, attempts, latest output preview, and linked run/execution details.
- Add a setup guide modal when the selected plan agent/workflow is missing setup, sync, credentials, sample import, or response-shape confirmation. Reuse the current agent setup guide modal patterns and sample workflow download API where practical.
- Include n8n direct Payload API read setup in the guide: create a read-only target-site Payload API key user, store the credential in n8n, and attach it to the agent's Payload read tool node.
- Add at least one importable plan sample workflow under `docs/n8n-workflows/` and expose it through the sample workflow listing.
- Add polling or existing stream-compatible refresh behavior.
- Document the manual test flow, setup guide behavior, and plan sample import path in `agent-harness-testing.md`.
- Generate the import map after adding the block/admin components.

Exit: an authenticated user can submit and monitor a structured plan from a dashboard page without using curl, and a new operator can import a matching sample n8n workflow from the setup guide.

### Phase 4: Approvals, Artifacts, And Write-Back

- Integrate task-level approval records with the existing approval endpoints.
- Link returned artifacts to `agent-artifacts` and, when needed, upload final assets to the selected target Payload site's media/upload collection. Large files, generated documents, exports, or media should become artifacts linked from the task/run instead of being copied into `sharedContext`.
- Add draft-only remote CMS output bindings that call the selected target Payload site's API, not the local NodesUI Local API.
- Store remote draft provenance on the plan/task/run: payload site, collection, document ID, version/draft ID when available, admin URL, preview URL, media IDs, and redacted write errors.
- Add evaluation run hooks for plan and task quality metrics.

Exit: high-risk or write-back tasks pause for explicit approval, generated artifacts remain auditable in NodesUI, and generated drafts are reviewable in the correct external Payload website.

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
- CMS draft generation targets configured external Payload sites through their Payload APIs. The current NodesUI install is only a target if it is explicitly registered as a site and uses the same remote-client flow.
- n8n agents may read approved target Payload site collections directly through those sites' Payload APIs using scoped, read-only API key credentials stored in n8n. NodesUI does not need to proxy those reads unless per-query NodesUI audit or runtime policy enforcement becomes required.
- Target Payload site schema, blocks, fields, drafts, media, locale, and tenant behavior must be represented by per-site capabilities/schema profiles. Do not assume NodesUI's local `pages` or `media` schema matches a target website.
- The first dashboard UI should use a small curated form for the initial `AgentPlanInput` shape. JSON Schema remains the server-side validation source of truth, but the first UX should optimize for this exact plan workflow instead of exposing a generic generated form as the primary interface.
- Controlled task expansion belongs in a future phase after fixed-block plan execution is reliable.
- Plan-capable workflows should have sample n8n imports and setup guide support when setup is not obvious from the selected agent/workflow.

### Still Open

- **Dependency output selection UI.** Store durable task outputs on the task record as bounded, redacted `outputPreview` plus structured `outputSummary`, and store only small cross-task values in `agent-plans.sharedContext`. The runtime default should pass only direct dependency summaries and artifact references. The remaining decision is how the curated form lets users explicitly select which upstream outputs each downstream task receives.
- **Companion plugin packaging.** Ship the target-site endpoint as the reusable `@transformable/nodesui-payload-companion` Payload plugin from `https://github.com/transformable-app/transformable-nodesui-payload-plugin`. A copy-paste endpoint can exist only as a debugging aid, not as a supported write-back path.
- **Remote draft preview links.** Each target site may generate preview URLs differently. The site config needs either a preview URL template or a companion endpoint that returns preview/admin URLs for generated drafts.
- **Future expansion policy.** Controlled task expansion is a future phase, but the policy still needs to define whether expansion is allowed per plan, per agent, or per role; whether inserted tasks can depend on completed tasks; and how approval should work for plans owned by non-admin users.
- **Curated form details.** The primary UI is a small curated `AgentPlanInput` form. Remaining details are field ordering, whether to include a raw JSON import/export panel, how dependency selection works as tasks are added, and whether an optional UI schema is useful later for labels, grouping, helper text, widgets, and collapsed sections.
- **Plan setup guide shape.** The setup guide should reuse the existing agent setup modal pattern, but the exact response type still needs to define plan-specific checks: selected agent supports structured input, workflow synced, sample imported, callback secret configured when required, output schema matched, artifact behavior supported, and smoke-test plan payload accepted.
