# n8n Agent Harness Extension Plan

## Objective

Extend the current n8n monitoring dashboard into an authenticated agent harness for selected n8n AI workflows.

The recommended boundary is:

- **n8n remains the execution plane.** It owns agent graphs, models, tools, memory nodes, credentials, retries, and workflow execution.
- **Payload becomes the control plane.** It owns the agent catalog, user and role authorization, sessions, messages, run records, dashboard UX, and audit/evaluation metadata.
- **The browser only calls Payload.** Payload invokes an n8n production Chat Trigger or Webhook server-side. n8n API keys, webhook credentials, and internal URLs must never be serialized to the client.

This approach extends the repo's existing server, workflow, execution, role, jobs, and dashboard systems instead of building a second workflow runtime.

## Current Baseline

The repo already provides most of the control-plane foundation:

- `servers` stores multiple n8n instances and their API connection details.
- `workflows`, `executions`, `credentials`, and data tables are synced on demand or through the scheduled `n8n-sync` Payload task.
- Synced records use server-scoped `sourceKey` values, so the design already supports multiple n8n instances.
- Dashboard pages are authenticated and can be restricted by Payload role.
- The dashboard can show workflow and execution state.
- `ChatEmbedBlock` can display an n8n-hosted chat in an iframe.

What is missing is a trusted invocation path and first-class state for agents, conversations, messages, and runs. The iframe is useful as a compatibility option, but it cannot enforce per-agent Payload authorization, reliably correlate users to executions, provide a unified audit trail, or support harness-owned UX.

## n8n Integration Contract

Only explicitly registered workflows should be callable as agents. Do not infer that every workflow containing an AI node is safe to expose.

Each registered workflow must use one of two adapters:

1. **Chat Trigger adapter (recommended for conversational agents)**
   - Use a published Chat Trigger in Embedded Chat mode.
   - Send a harness-generated session ID and authenticated user metadata.
   - Use the same session ID in the Chat Trigger and the workflow's memory node.
   - Enable streaming only when the workflow contains a streaming-capable node.
2. **Webhook adapter (recommended for task agents and structured requests)**
   - Use a published POST Webhook with Header or JWT authentication.
   - Return a documented JSON envelope, or a stream when the Webhook is configured for streaming.
   - Use this adapter for typed inputs, file/job requests, and workflows that are not conversational.

Define one harness-owned request envelope and translate it in the adapter:

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

Require the workflow response or completion callback to include `requestID` and, where possible, n8n's execution ID. The request ID is the stable correlation key because a webhook response does not inherently guarantee that the caller receives an execution ID.

The adapter should hide n8n-specific request fields such as `chatInput`, `sessionId`, `action`, and `metadata` from the rest of the app. This keeps the Payload domain stable if n8n's embedded-chat protocol changes.

## Data Model

### 1. `agents`

An explicit registry of callable workflows.

Suggested fields:

- `name`, `slug`, `description`, `enabled`
- `server`: required relationship to `servers`
- `workflow`: required relationship to `workflows`
- `transport`: `chat-trigger` or `webhook`
- `endpointPath`: a relative production webhook/chat path, never an arbitrary absolute URL
- `authStrategy`: `server-secret`, `header`, or `jwt`
- `secretReference`: identifier for an environment/secret-manager value; do not store the secret in a public or synced record
- `allowedRoles`: has-many relationship to `roles`
- `inputMode`: `chat` or `structured`
- `inputSchema` and `outputSchema`: optional JSON Schema for task agents
- `streamingEnabled`, `timeoutMS`, `maxInputBytes`
- presentation fields such as `welcomeMessage`, `placeholder`, and `suggestedPrompts`
- sync-derived capability summary: detected Chat Trigger, AI Agent, memory, streaming, and active/published state

Access should default to Admin for create/update/delete. Read/invoke access should require an authenticated user with one of `allowedRoles`, while Admin always passes.

Reuse the repo's existing role mechanism rather than inventing a new one. Roles are a `roles` collection (seeded with `Admin` and `User`), and each user carries a derived `roleNames` array persisted in the JWT via `saveToJWT`. Check roles with the existing `checkRole(['Admin'], user)` helper and the `roleNames`/`userHasRoleByName` utilities in `src/access/`, not the `user.roles.includes('admin')` style shown in `AGENTS.md`. Decide explicitly how the restricted `Content Manager` and `Customer` roles map to agent read/invoke access; by default they should be excluded the same way they are from other privileged collections (`adminAuthenticatedAndNotContentManager`).

Do not automatically delete an agent when a synced workflow disappears. Disable it and show a configuration error so audit history remains intact.

### 2. `agent-sessions`

One conversation or task thread.

Suggested fields:

- `agent`, `user`, `externalSessionID`
- `status`: `active`, `waiting`, `completed`, `failed`, `cancelled`
- `title`, `lastMessageAt`, `lastRunAt`
- `metadata`: small, allowlisted contextual values only
- optional `expiresAt`

Users may read and update only their own sessions unless they are Admin. Session ownership must be enforced by collection access constraints, not UI filtering.

### 3. `agent-messages`

Keep messages in a separate collection rather than an unbounded array on a session.

Suggested fields:

- `session`, `run`, `sequence`
- `role`: `user`, `assistant`, `system`, `tool`
- `content`, optional `structuredContent`
- `status`: `pending`, `streaming`, `complete`, `failed`
- `providerMessageID`, `createdBy`
- redacted attachment metadata if file support is added later

Use a compound ownership check through the related session. Never accept `role`, `createdBy`, or ownership values directly from the browser without replacing them server-side.

### 4. `agent-runs`

One attempted n8n invocation per user message or task submission.

Suggested fields:

- `requestID`: unique and indexed
- `agent`, `session`, `user`
- `status`: `queued`, `running`, `waiting`, `succeeded`, `failed`, `timed-out`, `cancelled`
- `startedAt`, `finishedAt`, `durationMS`
- `n8nExecutionID` and optional relationship to the synced `executions` record
- `inputPreview`, `outputPreview`, `errorCode`, `errorMessage`
- `usage`: optional model/token/cost metrics supplied by the workflow
- `feedback`: rating and user comment

Store bounded, redacted previews rather than raw prompts, credentials, tool payloads, or full n8n execution data by default.

## Server-Side Runtime

Add an `src/n8n/agents/` module with clear adapter boundaries:

- `types.ts`: canonical invocation, response, stream event, and error types
- `resolveAgent.ts`: loads the agent and enforces user/role access with `overrideAccess: false`
- `buildEndpoint.ts`: combines the related server's trusted base URL with a validated relative endpoint path
- `chatTriggerAdapter.ts` and `webhookAdapter.ts`: n8n-specific translation and response parsing
- `invokeAgent.ts`: creates run/message records, invokes n8n, and finalizes state
- `redact.ts`: bounded preview and sensitive-key filtering

Add custom authenticated routes rather than exposing n8n directly:

- `POST /api/agents/:slug/sessions` creates a user-owned session.
- `POST /api/agent-sessions/:id/messages` validates input, creates the user message/run, and invokes n8n.
- `GET /api/agent-sessions/:id/messages` returns paginated messages owned by the current user.
- `POST /api/agent-runs/:requestID/events` receives an authenticated completion/status callback from n8n when the initial request is asynchronous.
- `POST /api/agent-runs/:id/feedback` records a rating/comment from the owning user.

For streaming, the message endpoint should proxy the upstream `ReadableStream` without buffering it, forward only an allowlist of response headers, persist the final assembled assistant message, and mark disconnected/timed-out runs accurately. Pass the request abort signal upstream.

All nested writes performed from Payload hooks must receive `req`. Local API calls that execute on behalf of a user must pass `user` and `overrideAccess: false`. Administrative callback/job writes should be explicitly documented as system-owned.

For authenticating the async callback endpoint and any programmatic invocation, reuse existing primitives instead of inventing new ones. Payload's built-in API-key auth is already enabled on `users` (`auth.useAPIKey`), and the config already authorizes job runs with a `Bearer ${CRON_SECRET}` header pattern in `jobs.access.run`. Mirror that bearer-token approach for n8n completion callbacks, but use a dedicated secret (for example `N8N_CALLBACK_SECRET`) rather than overloading `CRON_SECRET`, so callback access can be rotated and scoped independently.

## Workflow Discovery and Sync Changes

Extend the existing workflow sync mapper to derive non-secret capability metadata from `workflow.nodes`, for example:

- contains Chat Trigger
- contains Webhook Trigger
- contains AI Agent or chain root
- contains memory connection
- contains evaluation nodes
- active/published state and workflow version

Use this only to suggest compatible workflows in the `agents.workflow` relationship and to warn about drift. Agent registration remains explicit because node detection cannot establish authorization, safe input handling, or a stable output contract.

Extend execution sync to extract the harness `requestID` from n8n custom execution data or another agreed response field. Use it to backfill `agent-runs.n8nExecutionID`, link the synced execution, and reconcile runs left in `running` after a process restart.

Add a small scheduled reconciliation task rather than folding run reconciliation into the full resource sync. It should only inspect non-terminal runs older than a short threshold.

## Dashboard UX

Create a first-party `AgentChatBlock` for dashboard pages:

- relationship to one enabled `agents` record
- server-rendered access check before rendering
- client chat shell with session list, paginated history, composer, pending state, retry, stop, and feedback controls
- streamed assistant output when enabled, otherwise a normal JSON response
- clear waiting/approval and error states
- links for Admin users to the related workflow and execution

Keep `ChatEmbedBlock` for externally hosted or transitional chats, but label it as an unmanaged embed. New harness features should use `AgentChatBlock`.

Provide async result delivery. When a run completes through the callback path rather than the original request, the user needs a way to learn the result is ready without holding the page open. At minimum, drive session/run status so a reopened session shows the finished result; ideally add lightweight in-app notifications (an `agent-notifications` concept or reuse of session status) and optional out-of-band channels such as email. Without this, the asynchronous execution path has no usable UX.

Add Admin views or collection columns for:

- agent health/configuration warnings
- recent runs, latency, failure rate, and unresolved waiting runs
- direct links to the related n8n workflow/execution
- manual test invocation restricted to Admin

## Security Requirements

These are release blockers for invocation support:

1. **Prevent SSRF.** Build invocation URLs from the selected `servers.baseURL` plus a normalized relative path. Reject protocols other than HTTPS in production, credentials in URLs, path traversal, fragments, and redirects to a different origin.
2. **Keep secrets server-side.** Store only a secret reference on the agent. Resolve values from environment variables or a secret manager. Redact authorization headers and known sensitive keys from errors/logs.
3. **Enforce object-level access.** Every session, message, run, feedback, and approval lookup must be constrained by the authenticated user or Admin role.
4. **Use restrictive collection access.** Do not copy the current public-read access used by monitoring records onto agent records.
5. **Bound inputs and outputs.** Validate JSON Schema where configured, cap body/message size, set timeouts, limit redirects, and cap persisted previews.
6. **Rate limit invocations.** Apply limits per user and agent before calling n8n. Add concurrency limits for expensive agents.
7. **Treat n8n output as untrusted.** Render text as text/Markdown through the existing safe renderer; never render arbitrary returned HTML or executable tool output.
8. **Use production triggers only.** Test webhook URLs are temporary and must be rejected by validation.
9. **Define retention.** Set retention periods for messages, runs, raw execution payloads, and user feedback. Provide deletion/anonymization behavior for user accounts.
10. **Audit administrative changes with a concrete mechanism.** Record who enabled an agent or changed its workflow, endpoint, roles, or auth strategy. Do not leave this abstract: enable Payload versions/drafts on `agents` to capture author and timestamp for every change, or add a dedicated append-only `agent-audit` collection. Administrative actions such as manual test invocations and approval resumes should also produce audit entries.
11. **Enforce spend and quota guardrails.** Rate limits cap request frequency but not cumulative cost. Add per-user and per-agent (and per-tenant, if multi-tenancy is adopted) budget or run-count quotas with a hard stop, so a misbehaving workflow or compromised account cannot drive unbounded model spend. Surface remaining quota to Admins.

Before exposing agent runs, also review the existing `workflows` and `executions` public read fields. Their `apiData` and payload/error previews should not become an indirect path to prompts, tool inputs, or personal data.

Note a current gap against the Objective's claim that internal URLs are never client-exposed: `servers` uses `read: anyone`, so `baseURL`, `apiPath`, and `dashboardURL` are publicly readable today (only `apiKey` is field-restricted). Agent endpoint construction depends on `servers.baseURL`, so either restrict these fields, expose only what the UI genuinely needs, or treat them as known-public and ensure no secret or internal-only host is ever placed in them.

## Reliability and Operational Requirements

These concerns are as important as the security requirements for a dependable harness. Several map directly onto existing phase exits.

1. **Define a synchronous execution-time budget.** This app is deployed in Docker behind a reverse proxy, so long synchronous invocations and long-lived streams are bounded by ingress/proxy timeouts, container memory, and redeploy/restart cycles rather than serverless limits. Set an explicit maximum synchronous duration; anything longer must use the asynchronous callback plus reconciliation path by default, not as an afterthought. Treat container restarts during a deploy as expected: in-flight runs must be reconcilable afterward (this reuses the planned reconciliation of non-terminal runs).
2. **Define end-to-end cancellation.** A client disconnect or stop action does not stop n8n on its own. "Stop" must mean: abort the local stream/await, and, when the n8n execution ID is known, call n8n's stop-execution API; when it is not yet known, mark the run `cancelling` and let reconciliation finalize it. Otherwise stopped runs keep consuming model spend.
3. **Make submission idempotent.** Callback idempotency by `requestID` is specified, but the user-facing send path also needs protection against double-clicks, client retries, and multiple tabs. Require a client-supplied idempotency key on `POST /messages`, enforce it with a unique constraint, and return the existing run instead of creating a duplicate.
4. **Decide conversation-context ownership.** State explicitly whether the harness resends prior turns or relies on the n8n memory node keyed by session ID. The recommended default is that n8n memory is the source of truth for model context, while Payload stores display history; document how edits, deletions, and retention pruning are reconciled so the two do not silently diverge.
5. **Serialize per-session sends.** `agent-messages.sequence` implies strict ordering, but the specified rate/concurrency limits are per user and per agent, not per session. Add a session-level in-flight guard so concurrent or retried sends cannot interleave runs or corrupt sequence numbering.
6. **Require operational observability.** Separate from agent-quality metrics, every run needs structured logs and error capture keyed by `requestID` and `n8nExecutionID`. Reuse the existing Sentry integration (`sentry.*.config.ts`) for error capture and route sensitive fields through `redact.ts` so a failed run is traceable end to end without leaking prompts or secrets.
7. **Define an error taxonomy.** Give `errorCode` a stable, enumerated set, for example `input-validation`, `auth`, `rate-limited`, `upstream-timeout`, `n8n-http-4xx`, `n8n-http-5xx`, `malformed-response`, `workflow-error`, and `cancelled`. Map each to a user-facing message and use it to separate user errors from infrastructure failures in the observability metrics.

Reflect these in the delivery phases: idempotency and the synchronous-vs-async cutover belong in Phase 1; cancellation, per-session serialization, and observability belong in Phase 2; restart reconciliation belongs in Phase 3.

## Human-in-the-Loop and Approvals

Defer approvals until basic invocation and correlation are reliable.

n8n's Chat node supports waiting for user replies and approvals, but its documented embedded-mode constraints mean the harness should not assume every Chat-node interaction can be transparently proxied. Use one of these explicit patterns:

- a harness callback creates an `agent-approvals` record, and a separate authenticated approval endpoint resumes the n8n wait URL; or
- the workflow returns a structured `waiting` response with a signed opaque resume token stored server-side.

Never expose an n8n resume URL directly to the browser. Approval records need owner/role checks, expiry, one-time consumption, and an audit trail.

## Evaluation and Observability

Start by reusing n8n's execution data rather than duplicating full traces in Payload.

MVP metrics:

- invocation count and success rate by agent
- first-byte and total latency
- timeout/cancellation rate
- user feedback score
- links to synced n8n execution errors

Later, add evaluation datasets and run summaries. n8n already supports light and metric-based evaluations backed by data tables or Google Sheets; Payload should catalog evaluation runs and display score trends rather than implement another evaluator unless product requirements demand it.

Do not promise token or cost reporting until each workflow emits a normalized usage object. The existing n8n execution API data is not a stable cross-model billing contract.

## Delivery Phases

### Phase 0: Contract and security foundation

- Document one sample Chat Trigger workflow and one sample Webhook task workflow.
- Finalize request, response, error, callback, and correlation envelopes.
- Add shared role-aware access helpers and URL/secret resolution.
- Review public fields on existing workflow/execution collections.

**Exit:** a documented curl-level invocation works through Payload without exposing an n8n URL or secret.

### Phase 1: Non-streaming MVP

- Add `agents`, `agent-sessions`, `agent-messages`, and `agent-runs`.
- Implement the Webhook adapter and authenticated invocation endpoints.
- Add `AgentChatBlock` with non-streaming responses and history.
- Add run/execution correlation and basic Admin diagnostics.
- Generate Payload types and import maps.

**Exit:** an authorized dashboard user can start a session, invoke one registered agent, reload history, and see a correlated run; an unauthorized user cannot discover or invoke it.

### Phase 2: Chat Trigger and streaming

- Add the Chat Trigger adapter and session metadata mapping.
- Proxy streaming responses with cancellation and timeout handling.
- Reconcile abandoned runs after restart/disconnect.
- Add per-user/agent rate and concurrency limits.

**Exit:** streamed and non-streamed workflows behave consistently and leave terminal audit records for success, error, timeout, and disconnect cases.

### Phase 3: Operations and approvals

- Add health/drift warnings from synced workflow capability metadata.
- Add completion callbacks for long-running agents.
- Add one-time, expiring approval records and resume handling.
- Add retention/anonymization jobs and operational dashboards.

**Exit:** long-running and waiting agents can recover across app restarts without bypassing Payload authorization.

### Phase 4: Evaluations

- Register evaluation datasets/runs and ingest normalized metrics from n8n.
- Add regression scorecards and version comparisons.
- Add promotion gates only after the metrics and workflow version semantics are stable.

## Beyond-Chat Capability Extensions

The delivery phases above ship an authenticated conversational and task agent harness. These extensions build on that foundation and reach into automation, structured work, file handling, and content production. They are numbered independently of the delivery phases above; see the Sequencing note for how they map onto that roadmap. The design rule is unchanged: Payload owns orchestration, scheduling, bindings, and artifacts as first-class state, while n8n still executes one agent per invocation through the same `AgentInvocation` envelope and SSRF-safe runtime.

### 1. Structured task console (non-conversational UX)

The first phases ship `AgentChatBlock`, but the data model already supports a `webhook` transport with `inputSchema`/`outputSchema` and `inputMode: structured`. Add a first-class non-chat surface over the same runtime.

- Add an `AgentTaskBlock` that auto-generates a form from the agent's `inputSchema` (JSON Schema → form), submits a single structured `agent-run`, and renders the typed `outputSchema` result (table, JSON viewer, downloadable artifact).
- Reuse `agents`, `agent-runs`, the invocation runtime, and access control unchanged. This is a different presentation over the same envelope, not a new execution path.
- Allow a session to hold zero conversational messages (a one-shot run), so `agent-messages` is optional for task agents.

Security: validate submitted input against `inputSchema` server-side, cap body size, and reuse the existing per-user/agent rate limits.

### 2. Async jobs, batch, and file I/O

For long-running or bulk work that does not fit request/response.

- Run background invocations through the repo's existing Payload `jobs` system, dispatched and then reconciled via the planned completion-callback endpoint. Extend `agent-runs` (or add `agent-jobs`) with queue/progress state.
- Support file inputs/outputs: accept Payload `media` uploads, pass signed or relative references (never raw bytes or public URLs) to n8n, and capture returned artifacts in an `agent-artifacts` collection linked to the run, with retention rules.
- Support batch/fan-out: submit a dataset (CSV or a Payload collection query) and create one run per row, with aggregate progress in the Admin view.

Security: cap upload size/count, validate MIME types, redact artifact metadata, and apply the same SSRF-safe URL construction to any artifact fetch-back.

### 3. Automation: schedules and event triggers

Move from user-initiated sends to system-initiated invocations.

- Add scheduled agents via a cron-style config (on the agent or an `agent-schedules` collection) driven by the existing scheduled-task infrastructure, producing system-owned runs.
- Add Payload-event triggers: an `afterChange`/`afterDelete` hook on selected collections invokes an agent (for example, enrich or classify a record).
- All system-initiated runs must pass `req` to nested operations, use a `context` skip-flag to prevent hook loops, and execute as an explicitly documented system actor rather than impersonating a user.

### 4. Agents that write back into Payload websites

Let agents produce Payload content, not just chat text. This is the highest-leverage extension for a Payload project, but NodesUI should act as the agent control plane for many Payload websites rather than assuming generated content belongs in the current NodesUI install.

- Add a `payload-sites` registry for external Payload websites with trusted API base URL, admin URL, write-back Payload API key secret reference, optional n8n read API key credential reference/name, auth collection slug, writable/readable collection allowlists, field/block allowlists, media policy, draft/version capabilities, locale/tenant support, and role access.
- Require the NodesUI companion plugin on each target Payload website before enabling CMS write-back. NodesUI syncs target-site schema profiles only through the plugin's sanitized API endpoint; GraphQL introspection and manual schema profiles are not supported write-back paths.
- Allow n8n agents to read approved target Payload site collections directly through those sites' Payload REST APIs. Use a separate read-only target-site Payload API key credential stored in n8n, scoped by the target site's own access control. This is acceptable for retrieval/tool use; NodesUI mediation is not required unless per-query NodesUI audit or runtime policy enforcement becomes a product requirement.
- Agents create or update target documents as drafts on the selected Payload website through that site's Payload API, using Payload's built-in API key authentication. The current NodesUI install is only a target if it is explicitly registered like any other Payload site.
- Add an `outputBinding` on the agent or plan describing the target Payload site, collection, schema profile, and field mapping. NodesUI validates the generated document against that binding before any remote API call.
- For media assets required by generated blocks, store local `agent-artifacts` for provenance, then upload the final asset to the target site's media/upload collection so generated block fields reference target-site media IDs.
- Guardrails: drafts only (never auto-publish), per-site collection and field allowlists, block-type allowlists, separate read-only n8n credentials and write-capable NodesUI credentials, target-site API key isolation, SSRF-safe URL building for NodesUI write-back calls and artifact fetch-back, and an audit record linking each generated remote draft to its `agent-run`.

### 5. Multi-agent orchestration / pipelines

Go beyond one agent per message.

- Add `agent-pipelines`: an ordered or conditional sequence of agents where one run's output feeds the next, with branching and a shared context envelope.
- Payload owns the pipeline definition, step state, retries, and audit. Each step remains a normal single n8n invocation, so no second workflow engine is introduced.

### 6. Knowledge / data management for retrieval agents

Give RAG-style agents a managed content source.

- Manage knowledge sources (documents, snippets, or links to n8n data tables) in Payload collections that agents reference, with role-scoped visibility.
- Optionally sync and catalog the n8n data tables already used for evaluations so the same content powers both retrieval and evaluation.

### Sequencing

These extensions are independent and can be delivered incrementally after the Phase 1 non-streaming MVP:

- Items 1 and 2 (structured console, file/batch I/O) are small additions over the existing webhook adapter and are good early follow-ups.
- Items 3 and 4 (automation, CMS write-back) pair naturally with the Phase 3 operations and callback work.
- Items 5 and 6 (pipelines, knowledge sources) are larger and should follow once invocation, correlation, and reconciliation are reliable.

## Optional: Multi-Tenancy with the Payload Multi-Tenant Plugin

Adopt `@payloadcms/plugin-multi-tenant` only if agents and their data must be isolated per customer, team, or workspace. The current role model (`Admin`, `User`, `Content Manager`, `Customer`) controls privilege level, not tenant boundaries, and the app is single-tenant today. The plugin is not yet a dependency; it would be installed and registered alongside the existing plugins in `src/plugins/index.ts`. Treat this as a deliberate architectural decision, not a default.

### When it is warranted

- Multiple customers or teams share one deployment but must never see each other's agents, sessions, runs, or n8n servers.
- Each tenant brings its own n8n instances, credentials, and secret references.
- You need a tenant selector in the admin UI and tenant-scoped queries without hand-writing tenant filters on every collection.

If the only requirement is "different users see different privilege levels," the existing role mechanism is sufficient and the plugin adds avoidable complexity.

### What it adds

- A `tenants` collection and a `tenant` field automatically injected into each enabled collection.
- Tenant-scoped access constraints and an admin tenant selector.
- User-to-tenant associations (commonly via the plugin's tenants array field on `users`).

### How it maps onto this plan

- Enable tenant scoping on `servers` plus the new `agents`, `agent-sessions`, `agent-messages`, `agent-runs`, and (where added) `agent-artifacts`, knowledge sources, and `agent-pipelines`.
- Tenant scoping composes with, and does not replace, the existing per-user ownership and role checks. Within a tenant, a user still reads only their own sessions/messages/runs unless Admin; the tenant constraint is layered on top.
- `resolveAgent` must verify that the agent, its `server`, and the target session all belong to the actor's tenant before building the endpoint, in addition to the role/ownership checks already specified.
- Namespace each agent's `secretReference` per tenant so resolved secrets cannot collide or leak across tenants.

### Caveats and prerequisites

- Tenant isolation is incompatible with the current `read: anyone` access on `servers`, `workflows`, and `executions`. Tightening those public fields (already flagged in Security Requirements) becomes mandatory, not optional, under multi-tenancy.
- System-owned writes that run without a user — the `n8n-sync` task, the reconciliation task, and n8n completion callbacks — must set the correct tenant explicitly and must never write across tenants. Make the sync mapper derive tenant from the server being synced.
- The `onInit` bootstrap (seeded `Admin`/`User` roles and the default dashboard page) and the first-user admin flow need a default/system tenant to attach to.
- Adoption is additive but not trivial: install the plugin, define `tenants`, backfill existing single-tenant data into a default tenant, and re-run `generate:types` and `generate:importmap`.

See the [Multi-Tenant plugin docs](https://payloadcms.com/docs/plugins/multi-tenant) for field and access details.

## Validation Strategy

### Unit tests

- role and ownership access constraints
- endpoint normalization, same-origin redirect enforcement, and test-URL rejection
- secret resolution and redaction
- adapter request/response translation
- size, schema, timeout, and state-transition validation

### Integration tests

- unauthorized, wrong-role, owner, and Admin API cases
- session/message/run transaction behavior
- mocked n8n success, HTTP error, malformed response, timeout, callback replay, and redirect cases
- idempotent callback and execution correlation by `requestID`
- reconciliation of stale non-terminal runs

### Browser tests

- create/reopen a chat session
- streamed and non-streamed response rendering
- retry and disconnect behavior
- hidden/disabled agents for unauthorized users
- Admin workflow/execution links and diagnostics

After schema or component work, run:

```bash
pnpm generate:types
pnpm generate:importmap
pnpm exec tsc --noEmit
pnpm test:int
pnpm test:e2e
```

## Recommended First Slice

Implement a single non-streaming Webhook agent end to end before adapting the existing chat embed. It exercises the hard boundaries - authorization, URL construction, secret handling, session/run persistence, error handling, and correlation - without combining them with streaming protocol complexity.

The first slice should deliberately exclude arbitrary workflow execution, file uploads, tool-level traces, approvals, workflow editing, and evaluation orchestration.

## Official n8n References

- [Chat Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/)
- [Chat Trigger common issues and metadata](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/common-issues/)
- [Webhook node and authentication modes](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [Streaming responses](https://docs.n8n.io/workflows/streaming/)
- [Chat node and human-in-the-loop constraints](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chat/)
- [Evaluation overview](https://docs.n8n.io/advanced-ai/evaluations/overview/)
