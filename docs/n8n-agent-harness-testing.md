# n8n Agent Harness Testing

This guide verifies the agent harness: agent registration, authenticated session creation, message invocation, structured SSE streaming, callback completion, history reads, cancellation, reconciliation, and feedback.

## Prerequisites

- Run the app with Node 22 for local validation. Node 20 can hit the current `undici` runtime mismatch during Payload CLI commands.
- Have an admin user in Payload.
- Have at least one synced `servers` record and one synced `workflows` record, or create temporary records in the admin UI for a local test.
- Set any invocation secret referenced by the agent:

```bash
export TEST_AGENT_WEBHOOK_SECRET="replace-me"
export N8N_CALLBACK_SECRET="replace-me-too"
```

The agent `secretReference` field stores the environment variable name, for example `TEST_AGENT_WEBHOOK_SECRET`, not the secret value.

## Validate The Build

Run these from the repo root:

```bash
PATH=/Users/nicks/.nvm/versions/node/v22.14.0/bin:$PATH ./node_modules/.bin/payload generate:types
PATH=/Users/nicks/.nvm/versions/node/v22.14.0/bin:$PATH ./node_modules/.bin/tsc --noEmit
```

Expected result: both commands exit successfully.

## Configure A Test n8n Workflow

Create or choose an n8n production Webhook or Chat Trigger workflow.

For the simplest synchronous Webhook test, the workflow should:

- Accept `POST`.
- Require the same bearer token as `TEST_AGENT_WEBHOOK_SECRET`.
- Return JSON:

```json
{
  "content": "Harness response received",
  "status": "succeeded",
  "n8nExecutionID": "manual-test-execution"
}
```

Use a production webhook path such as `/webhook/test-agent`. Do not use an absolute URL in Payload; the harness combines the selected server `baseURL` with the agent `endpointPath`.

## Register The Agent

In Payload admin, create an `Agents` record:

- `Name`: `Test Agent`
- `Slug`: `test-agent`
- `Enabled`: checked
- `Server`: the n8n server record
- `Workflow`: the matching workflow record
- `Transport`: `Webhook` or `Chat Trigger`
- `Endpoint Path`: the relative production path, for example `/webhook/test-agent`
- `Auth Strategy`: `Server Secret`
- `Secret Reference`: `TEST_AGENT_WEBHOOK_SECRET`
- `Allowed Roles`: include `User` for non-admin testing
- `Input Mode`: `Chat`
- `Streaming Enabled`: checked for structured SSE tests
- `Max Runs Per Minute`: `12`
- `Max Concurrent Runs`: `1`
- `Max Runs Per Day`: `100`
- `Timeout MS`: `30000`
- `Max Input Bytes`: `20000`

Admin users can invoke any enabled agent. Non-admin users must have one of the agent's `Allowed Roles`.

## Browser Smoke Test

Log into the local app at `http://localhost:3000/admin`.

Create a session from the browser console:

```js
const sessionResponse = await fetch('/api/agents/test-agent/sessions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Harness smoke test' }),
})
const { session } = await sessionResponse.json()
session
```

Expected result:

- HTTP `200`
- A new `agent-sessions` record owned by the logged-in user
- `session.externalSessionID` is present

Send a message:

```js
const messageResponse = await fetch(`/api/agent-sessions/${session.id}/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    idempotencyKey: crypto.randomUUID(),
    text: 'hello from Payload',
  }),
})
const result = await messageResponse.json()
result
```

Expected result:

- HTTP `200`
- One `agent-runs` record with `status: "succeeded"` for synchronous responses
- One user `agent-messages` record
- One assistant `agent-messages` record
- `agent-runs.inputPreview` and `outputPreview` are bounded text previews

Read message history:

```js
await fetch(`/api/agent-sessions/${session.id}/messages`).then((res) => res.json())
```

Expected result: messages return in `sequence` order.

## Structured SSE Test

For streaming agents, send a message with `Accept: text/event-stream`:

```js
const streamResponse = await fetch(`/api/agent-sessions/${session.id}/messages`, {
  method: 'POST',
  headers: {
    accept: 'text/event-stream',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    idempotencyKey: crypto.randomUUID(),
    text: 'stream hello from Payload',
  }),
})

const reader = streamResponse.body.getReader()
const decoder = new TextDecoder()
let streamText = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  streamText += decoder.decode(value, { stream: true })
}

streamText
```

Expected result:

- HTTP `200`
- `content-type` is `text/event-stream`
- The stream includes structured `run`, `token`, `message`, and `done` events
- The assistant message is persisted with `status: "complete"`
- The run is terminal, normally `status: "succeeded"`

## Cancellation Test

Start a streaming request against a workflow that runs long enough to cancel, then call:

```js
await fetch(`/api/agent-runs/${RUN_ID}/cancel`, {
  method: 'POST',
}).then((res) => res.json())
```

Expected result:

- The run is updated to `status: "cancelled"`
- If the run has `n8nExecutionID`, Payload makes a best-effort n8n stop-execution request
- The owning session is marked `cancelled`

Submit feedback:

```js
await fetch(`/api/agent-runs/${result.run.id}/feedback`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ rating: 5, comment: 'Smoke test passed' }),
}).then((res) => res.json())
```

Expected result: the run has `feedback.rating`, `feedback.comment`, and `feedback.submittedAt`.

## Async Callback Test

For async workflows, first send a message that leaves the run in `waiting`, then have n8n call:

```bash
curl -X POST http://localhost:3000/api/agent-runs/REQUEST_ID/events \
  -H "authorization: Bearer replace-me-too" \
  -H "content-type: application/json" \
  -d '{
    "requestID": "REQUEST_ID",
    "status": "succeeded",
    "content": "Async result is ready",
    "n8nExecutionID": "123"
  }'
```

Expected result:

- HTTP `200`
- The matching run is updated to `succeeded`
- A new assistant message is appended to the session
- The session returns to `active`

The route is keyed by the `requestID` in the body; the URL parameter exists for routing consistency.

Calling the same callback twice should return the existing terminal run and should not append a duplicate assistant message.

## Approval Test

For waiting workflows that require human approval, have n8n call the callback endpoint with an approval payload:

```bash
curl -X POST http://localhost:3000/api/agent-runs/REQUEST_ID/events \
  -H "authorization: Bearer replace-me-too" \
  -H "content-type: application/json" \
  -d '{
    "requestID": "REQUEST_ID",
    "status": "waiting",
    "approval": {
      "title": "Approve deployment",
      "prompt": "Approve this action?",
      "resumeURL": "https://n8n.example.com/webhook/resume/opaque-token",
      "expiresAt": "2026-06-27T00:00:00.000Z"
    }
  }'
```

Expected result:

- A pending `agent-approvals` record is created.
- The n8n resume URL is not exposed to non-admin readers.
- Resolving `POST /api/agent-approvals/APPROVAL_ID/resolve` with `{ "approved": true }` calls the resume URL server-side and marks the approval consumed.

## Negative Tests

Verify these failures before exposing the harness beyond admin testing:

- Unauthenticated request to `POST /api/agents/test-agent/sessions` returns `401`.
- Non-admin user without an allowed role cannot read or invoke the agent.
- `endpointPath` configured as an absolute URL fails invocation.
- `endpointPath` containing `..` or a fragment fails invocation.
- Missing or wrong `N8N_CALLBACK_SECRET` returns `401` on callback.
- Message body larger than `Max Input Bytes` returns `413`.
- Missing `idempotencyKey` on message send returns `400`.
- Reusing the same `idempotencyKey` for the same session returns the existing run instead of creating a duplicate.
- A second in-flight send for the same session returns `409`.
- Exceeding `Max Runs Per Minute`, `Max Concurrent Runs`, or `Max Runs Per Day` returns `429`.
- `endpointPath` containing `/webhook-test/` fails invocation.

## Reconciliation Test

The `agent-run-reconciliation` task checks stale non-terminal runs independently from the full n8n sync.

To test manually, create or identify an old `queued`, `running`, or `waiting` run and execute the task with a short `staleAfterMS` value.

Expected result:

- The stale run is marked `timed-out`
- The session is moved out of `waiting`
- The task output includes the number of reconciled runs

## Retention Test

The `agent-retention` task deletes expired approvals/artifacts and can optionally delete old sessions, messages, and runs.

Expected result:

- Expired `agent-approvals` and `agent-artifacts` are deleted.
- Old sessions/messages/runs are only deleted when `retentionDays` is provided.

## Admin Records To Inspect

After a successful test, inspect these collections in admin:

- `Agents`
- `Agent Sessions`
- `Agent Messages`
- `Agent Runs`
- `Agent Approvals`
- `Agent Artifacts`
- `Agent Evaluation Runs`

The agent collections should appear after `Data Table Rows` in the admin nav.

## Current Scope Limits

This implementation covers the authenticated conversational harness through structured SSE streaming, explicit cancellation, approval records/resume handling, stale-run reconciliation, retention cleanup, artifacts, and evaluation run cataloging. It does not yet provide rich operational dashboards, out-of-band notifications, or an automated evaluator runner beyond storing normalized evaluation run results.
