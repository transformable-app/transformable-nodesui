# Agent Harness User Guide

This guide documents the agent harness as it is currently implemented. The harness turns selected n8n AI workflows into authenticated, role-gated agents that users can run from the Payload dashboard or the authenticated API, while n8n stays the execution plane.

For background and the longer-term roadmap, see [n8n-agent-harness-plan.md](./n8n-agent-harness-plan.md). For step-by-step verification, see [agent-harness-testing.md](./agent-harness-testing.md).

## Dashboard Onboarding (Admin)

On the admin dashboard welcome banner, **Set up test agent** sits next to **Sync n8n data now**. It is visible to Admin users only.

Clicking the button calls `POST /api/agents/test-setup`, which upserts the canonical `test-agent` record and opens the shared setup guide modal.

## Agent Setup Guide (Admin)

Every agent — whether created manually or via the dashboard test button — needs a matching production workflow in n8n. On the **Agents** create/edit view, the sidebar includes **Open setup guide**.

That button calls `POST /api/agents/setup-guide` (or `POST /api/agents/:id/setup-guide` for saved records) and opens the same checklist modal used by the dashboard flow. It evaluates the current form values on unsaved records, so you can open the guide while configuring a new agent.

The guide checks:

- Invocation secret env var (`secretReference`, for example `TEST_AGENT_WEBHOOK_SECRET`)
- Optional `N8N_CALLBACK_SECRET` for async callback tests
- Whether the linked workflow appears to expose the configured `endpointPath`
- Whether server/workflow/agent fields are present

It shows n8n steps, a copyable response example, optional **Sync workflows first**, sample workflow imports ([docs/n8n-workflows/README.md](./n8n-workflows/README.md)), and a smoke-test snippet for the agent slug. It does not invoke n8n automatically.

## How It Works

- **n8n executes.** Each agent points at one synced `workflows` record on one synced `servers` record. Payload calls a production Webhook or Chat Trigger on that server.
- **Payload controls access and state.** Payload owns the agent registry, role authorization, sessions, messages, runs, approvals, artifacts, and evaluation records.
- **The browser only calls Payload.** n8n base URLs and secrets are resolved server-side and are never sent to the client. Invocation endpoints are built from the selected server `baseURL` plus a validated relative path.

## Roles And Access

Access reuses the project's existing role mechanism (`Admin`, `User`, and the restricted `Content Manager`/`Customer` roles), checked with the `checkRole` helper and each user's JWT `roleNames`.

| Collection | Read | Create / Update / Delete |
| --- | --- | --- |
| `agents` | Admin, or a user holding one of the agent's `allowedRoles` (enabled agents only) | Admin only (excludes Content Manager) |
| `agent-sessions` | Owner or Admin | Create: any authenticated user; Update: owner or Admin; Delete: Admin |
| `agent-messages` | Owner (via session) or Admin | Create: any authenticated user; Update: owner or Admin; Delete: Admin |
| `agent-runs` | Owner or Admin | Create: any authenticated user; Update: owner or Admin; Delete: Admin |
| `agent-approvals` | Owner or Admin (`resumeURL` is Admin-only) | Admin only |
| `agent-artifacts` | Owner or Admin | Create: any authenticated user; Update: owner or Admin; Delete: Admin |
| `agent-evaluation-runs` | Admin only (excludes Content Manager) | Admin only |

Admins can always read and invoke any enabled agent. Non-admins can only see and run agents whose `allowedRoles` intersect their roles. Object-level ownership is enforced by collection access constraints, not by UI filtering.

## Registering An Agent (Admin)

Create an `Agents` record in the admin panel. Fields:

### Identity

- **Name** - Display name (used as the title).
- **Slug** - Unique, indexed identifier used in API paths such as `/api/agents/<slug>/sessions`.
- **Description** - Optional internal description.
- **Enabled** - Must be checked before the agent can be invoked. Disabled agents are hidden from non-admins.

### Connection

- **Server** - Required relationship to a synced `servers` record. Supplies the trusted `baseURL`.
- **Workflow** - Required relationship to a synced `workflows` record.
- **Transport** - `Webhook` (default, recommended for task/structured agents) or `Chat Trigger` (recommended for conversational agents).
- **Endpoint Path** - Relative production path, for example `/webhook/agent`. Absolute URLs, `..`, `#` fragments, protocol-relative `//` paths, and n8n test paths (`/webhook-test/...`) are rejected.
- **Auth Strategy** - `Server Secret` (default), `Header`, or `JWT`.
- **Secret Reference** - The name of the environment variable that holds the invocation secret (for example `TEST_AGENT_WEBHOOK_SECRET`). The secret value itself is never stored on the record and is resolved server-side at call time.

### Input / Output

- **Input Mode** - `Chat` (default) or `Structured`. Structured agents require a `data` object on each send.
- **Input Schema** / **Output Schema** - Optional JSON Schema objects. When set, inbound `data` and outbound responses are validated server-side (supports `type`, `enum`, `required`, nested `properties`, and array `items`).
- **Streaming Enabled** - Allows Server-Sent Events (SSE) streaming responses. Streaming requests against an agent without this flag are rejected.

### Limits And Quotas (per user, per agent)

- **Max Runs Per Minute** - Default `12` (1-120).
- **Max Concurrent Runs** - Default `1` (1-10).
- **Max Runs Per Day** - Default `100` (1-10000).
- **Timeout MS** - Default `30000` (1000-120000). Streaming requests that exceed this are aborted and marked `timed-out`.
- **Max Input Bytes** - Default `20000` (1-200000). Larger message text returns `413`.

### Presentation

- **Welcome Message**, **Placeholder**, **Suggested Prompts** - Used by the dashboard chat UI.
- **Capabilities** - Non-secret capability summary derived from the selected workflow.
- **Configuration Warning** - Read-only field surfaced when the agent configuration drifts.

Agents are versioned (`maxPerDoc: 50`), so administrative changes to an agent are tracked with author and timestamp.

## Using An Agent

### From The Dashboard

Add an **Agent Chat** block (`agentChat`) to a Dashboard page and select an agent. The block:

- Server-renders an access check first and renders nothing for signed-out users or users who cannot see the enabled agent.
- Shows the agent's welcome message, placeholder, and a composer.
- Streams assistant output when the agent has streaming enabled, otherwise shows a single JSON response.
- Shows a workflow link back to n8n for Admin users.

The older **Chat Embed** block (`chatEmbed`) renders an externally hosted n8n chat in an iframe. It is an unmanaged embed kept for transitional/external chats; new harness features use the Agent Chat block.

### From The API

All routes require an authenticated Payload user (session cookie or API key) unless noted. Errors return `{ error, code }` with the matching HTTP status; `code` is one of the harness error codes listed below.

#### Create a session

```bash
POST /api/agents/:slug/sessions
Content-Type: application/json

{ "title": "Optional title", "context": { "optional": "allowlisted values" } }
```

Returns `{ session }` owned by the current user with a generated `externalSessionID`.

#### List your sessions for an agent

```bash
GET /api/agents/:slug/sessions
```

Returns up to 20 of your sessions, newest first.

#### Send a message

```bash
POST /api/agent-sessions/:id/messages
Content-Type: application/json

{
  "idempotencyKey": "<uuid>",
  "text": "hello",
  "data": { "optional": "structured input" },
  "context": { "optional": "context" }
}
```

- `idempotencyKey` is **required**. Reusing a key for the same session returns the existing run instead of creating a duplicate.
- For a synchronous Webhook agent, the response includes the user message, assistant message, and a terminal `run` (normally `succeeded`).
- A `waiting` response leaves the run and session in `waiting` until an async callback completes it.

#### Stream a message (SSE)

Send the same body with `Accept: text/event-stream` (or header `x-agent-stream: true`). Requires `streamingEnabled`. The stream emits structured events:

- `run` - run started, includes `runID` and `requestID`
- `message` - assistant message id and status (`streaming` / `complete` / `failed`)
- `token` - incremental content
- `error` - error `code` and `message`
- `done` - terminal run status (`succeeded` / `failed` / `timed-out` / `cancelled`)

The final assistant message is persisted and the run is finalized regardless of client disconnect.

#### Read message history

```bash
GET /api/agent-sessions/:id/messages?page=1
```

Returns messages in `sequence` order, 50 per page.

#### List pending approvals for a session

```bash
GET /api/agent-sessions/:id/approvals
```

#### Cancel a run

```bash
POST /api/agent-runs/:id/cancel
```

Marks the run `cancelled`, makes a best-effort n8n stop-execution call when `n8nExecutionID` is known, and marks the session `cancelled`.

#### Submit feedback

```bash
POST /api/agent-runs/:id/feedback
Content-Type: application/json

{ "rating": 5, "comment": "Optional, max 2000 chars" }
```

`rating` must be an integer 1-5. Stores `feedback.rating`, `feedback.comment`, and `feedback.submittedAt`.

#### Resolve an approval

```bash
POST /api/agent-approvals/:id/resolve
Content-Type: application/json

{ "approved": true, "data": { "optional": "response payload" } }
```

Calls the n8n resume URL server-side (validated to stay on the configured server), then marks the approval `approved`/`rejected` and consumed. The n8n resume URL is never exposed to non-admin readers.

### System / n8n callbacks

These routes are authenticated with a bearer token, not a user session. They require `N8N_CALLBACK_SECRET` and reject requests with a missing or wrong token (`401`).

#### Run completion / status callback

```bash
POST /api/agent-runs/:requestID/events
Authorization: Bearer <N8N_CALLBACK_SECRET>
Content-Type: application/json

{ "requestID": "<id>", "status": "succeeded", "content": "...", "n8nExecutionID": "123" }
```

- Keyed by the `requestID` in the body (the URL param is for routing consistency).
- On `succeeded`, appends an assistant message and returns the session to `active`.
- On `status: "waiting"` with an `approval` object, creates a pending `agent-approvals` record.
- Idempotent: a repeated callback for a terminal run returns the existing run and does not duplicate messages.

#### Evaluation run callback

```bash
POST /api/agent-evaluation-runs/events
Authorization: Bearer <N8N_CALLBACK_SECRET>
Content-Type: application/json

{ "agentSlug": "test-agent", "status": "succeeded", "score": 0.9, "metrics": { } }
```

Upserts an `agent-evaluation-runs` record (matched by `id`, then `n8nExecutionID`, otherwise created for the given `agentID`/`agentSlug`).

## Data Model Summary

| Collection | Purpose | Key fields |
| --- | --- | --- |
| `agents` | Registry of callable workflows | `slug`, `enabled`, `server`, `workflow`, `transport`, `endpointPath`, `authStrategy`, `secretReference`, `allowedRoles`, limits, schemas |
| `agent-sessions` | One conversation/task thread | `agent`, `user`, `externalSessionID`, `status` (`active`/`waiting`/`completed`/`failed`/`cancelled`), `lastMessageAt` |
| `agent-messages` | Individual turns | `session`, `run`, `sequence`, `role` (`user`/`assistant`/`system`/`tool`), `content`, `status` |
| `agent-runs` | One n8n invocation attempt | `requestID` (unique), `idempotencyKey` (unique), `status`, timing (`firstByteMS`, `durationMS`), `n8nExecutionID`, bounded `inputPreview`/`outputPreview`, `errorCode`, `feedback` |
| `agent-approvals` | Human-in-the-loop wait/resume | `run`, `session`, `status`, `prompt`, Admin-only `resumeURL`, `expiresAt` |
| `agent-artifacts` | Run outputs | `run`, `kind` (`json`/`media`/`text`/`url`), `expiresAt` |
| `agent-evaluation-runs` | Catalog of evaluation results | `agent`, `workflow`, `dataTable`, `status`, `score`, `metrics` |

Runs store bounded, redacted previews rather than raw prompts, credentials, or full execution payloads.

## Background Jobs

Both jobs run on the `n8n` queue and are processed in-process when `PAYLOAD_JOBS_AUTORUN=true`.

- **`agent-run-reconciliation`** - Finalizes stale non-terminal runs (`queued`/`running`/`waiting`) and moves their sessions out of `waiting` so in-flight runs survive container restarts. Default schedule every 5 minutes; override `AGENT_RUN_RECONCILIATION_CRON`. Optional `staleAfterMS` input (defaults to 5 minutes).
- **`agent-retention`** - Always deletes expired `agent-approvals` and `agent-artifacts`. When `retentionDays` is provided, also deletes old terminal runs and closed sessions. Default schedule daily at 02:30; override `AGENT_RETENTION_CRON`.

## Security Behavior (Implemented)

- **SSRF protection** - Invocation and resume URLs are built from the configured server origin only. Credentials-in-URL, non-HTTP(S) protocols, cross-origin targets, path traversal, fragments, and test webhook paths are rejected; HTTPS is enforced in production.
- **Server-side secrets** - Agents store only a `secretReference` (env var name). Values are resolved server-side and kept off the client.
- **Object-level access** - Sessions, messages, runs, approvals, and artifacts are constrained to the owning user or Admin. Approval `resumeURL` is Admin-only at the field level.
- **Bounded inputs/outputs** - Message size cap (`maxInputBytes`/`413`), JSON Schema validation, timeouts, and capped previews.
- **Idempotency and serialization** - A required idempotency key plus a unique `sessionActiveLock` prevent duplicate and interleaved sends; a second in-flight send for a session returns `409`.
- **Rate and quota limits** - Per-user per-agent minute/concurrent/daily caps return `429`.
- **Untrusted output** - Assistant content is rendered as text/Markdown through the existing safe renderer.
- **Observability** - Failures are logged and captured in Sentry, keyed by `requestID` and `n8nExecutionID`.

### Error codes

`input-validation`, `auth`, `not-found`, `rate-limited`, `upstream-timeout`, `n8n-http-4xx`, `n8n-http-5xx`, `malformed-response`, `workflow-error`, `cancelled`.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `N8N_CALLBACK_SECRET` | Bearer token for the run-completion and evaluation callback endpoints. |
| `<secretReference>` | One env var per agent (named by the agent's `Secret Reference`) holding the n8n invocation secret. |
| `AGENT_RUN_RECONCILIATION_CRON` | Optional override for the reconciliation schedule (default `0 */5 * * * *`). |
| `AGENT_RETENTION_CRON` | Optional override for the retention schedule (default `0 30 2 * * *`). |

The harness also relies on the existing `PAYLOAD_JOBS_AUTORUN` / `PAYLOAD_JOBS_AUTORUN_CRON` settings to process the `n8n` job queue.

## Current Scope Limits

The implemented harness covers authenticated conversational and structured invocation, SSE streaming, cancellation, async completion callbacks, approval records and resume handling, stale-run reconciliation, retention cleanup, artifacts, and evaluation-run cataloging. It does not yet provide rich operational dashboards, out-of-band notifications, or an automated evaluator runner beyond storing normalized evaluation results.
