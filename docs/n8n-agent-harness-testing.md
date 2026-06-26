# n8n Agent Harness Testing

This guide verifies the first harness slice: agent registration, authenticated session creation, message invocation, callback completion, history reads, and feedback.

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

## Negative Tests

Verify these failures before exposing the harness beyond admin testing:

- Unauthenticated request to `POST /api/agents/test-agent/sessions` returns `401`.
- Non-admin user without an allowed role cannot read or invoke the agent.
- `endpointPath` configured as an absolute URL fails invocation.
- `endpointPath` containing `..` or a fragment fails invocation.
- Missing or wrong `N8N_CALLBACK_SECRET` returns `401` on callback.
- Message body larger than `Max Input Bytes` returns `413`.
- Reusing the same `idempotencyKey` for the same session returns the existing run instead of creating a duplicate.

## Admin Records To Inspect

After a successful test, inspect these collections in admin:

- `Agents`
- `Agent Sessions`
- `Agent Messages`
- `Agent Runs`

The agent collections should appear after `Data Table Rows` in the admin nav.

## Current Scope Limits

This implementation covers the first non-streaming harness slice. It does not yet provide a first-party chat block UI, streaming proxy, approval records, run reconciliation task, or n8n stop-execution cancellation.
