# n8n Sample Workflows For The Agent Harness

Importable n8n workflow JSON files for testing the Payload agent harness. They match the response shapes documented in [agent-harness-testing.md](../agent-harness-testing.md) and the setup guide in the admin UI.

## Files

| File | Production path | Purpose |
| --- | --- | --- |
| [test-agent-webhook.json](./test-agent-webhook.json) | `/webhook/test-agent` | Canonical synchronous smoke test. Returns the default harness success payload. |
| [test-agent-echo-webhook.json](./test-agent-echo-webhook.json) | `/webhook/test-agent-echo` | Returns `Echo: <user text>` from the harness `input.text` field. |
| [test-agent-async-waiting.json](./test-agent-async-waiting.json) | `/webhook/test-agent-async` | Returns `status: "waiting"` only. Use with a manual Payload callback curl. |
| [test-agent-async-callback.json](./test-agent-async-callback.json) | `/webhook/test-agent-async-callback` | Returns `waiting`, then POSTs a completion callback to Payload in the same execution. |

Start with **test-agent-webhook.json** when using **Set up test agent** on the dashboard (endpoint path `/webhook/test-agent`).

## Import Into n8n

1. Download a sample from the admin **Setup guide** modal, or fetch:
   - List: `GET /api/n8n/sample-workflows`
   - File: `GET /api/n8n/sample-workflows/<filename>` (for example `/api/n8n/sample-workflows/test-agent-webhook.json`)
2. In n8n, open **Workflows** → **Import from file** (or paste JSON).
3. Select the downloaded JSON (or one of the files from this folder in the repo).
3. Create the credentials below and attach them to the **Webhook** node (and **Callback Payload** node for the async callback workflow).
4. Set n8n environment variables if required (see below).
5. **Publish / activate** the workflow so the production URL is used (`/webhook/...`, not `/webhook-test/...`).
6. In Payload, run **Sync n8n data now** or **Sync workflows first** in the setup guide.
7. Register or update the matching **Agents** record (`endpointPath`, `secretReference`, server, workflow).

## Credentials (Required After Import)

n8n exports do **not** include secret values. Create these in **Credentials** and reconnect them on the imported nodes.

### Payload Test Agent Bearer

Used by the **Webhook** node on every sample workflow.

| Field | Value |
| --- | --- |
| Type | Header Auth |
| Name | `Authorization` (header name) |
| Value | `Bearer <same value as TEST_AGENT_WEBHOOK_SECRET on Payload>` |

Example: if Payload has `TEST_AGENT_WEBHOOK_SECRET=replace-me`, set the credential value to `Bearer replace-me`.

The harness sends `Authorization: Bearer …` on every invocation. The value must match exactly.

### Payload Callback Secret (async callback workflow only)

Used by the **Callback Payload** HTTP Request node in [test-agent-async-callback.json](./test-agent-async-callback.json).

| Field | Value |
| --- | --- |
| Type | Header Auth |
| Name | `Authorization` |
| Value | `Bearer <same value as N8N_CALLBACK_SECRET on Payload>` |

## n8n Environment Variables

| Variable | Required for | Example |
| --- | --- | --- |
| `PAYLOAD_PUBLIC_URL` | Async callback workflow | `http://localhost:3000` |

Set this on the n8n host (Docker `environment`, systemd, etc.) so the **Callback Payload** node can reach Payload. Use a URL n8n can resolve (for Docker, `http://host.docker.internal:3000` on macOS/Windows).

Payload-side vars (not in these JSON files):

- `TEST_AGENT_WEBHOOK_SECRET` — agent invocation
- `N8N_CALLBACK_SECRET` — callback route auth

## Expected Response Shapes

### Synchronous success (test-agent-webhook)

```json
{
  "content": "Harness response received",
  "status": "succeeded",
  "n8nExecutionID": "<execution id>"
}
```

### Waiting (async samples)

```json
{
  "status": "waiting",
  "content": "...",
  "n8nExecutionID": "<execution id>"
}
```

### Callback body (Payload `POST /api/agent-runs/:requestID/events`)

```json
{
  "requestID": "<from harness invocation>",
  "status": "succeeded",
  "content": "Async result is ready",
  "n8nExecutionID": "<execution id>"
}
```

## Matching Payload Agent Fields

| Workflow file | Suggested `slug` | `endpointPath` | `transport` |
| --- | --- | --- | --- |
| test-agent-webhook.json | `test-agent` | `/webhook/test-agent` | `webhook` |
| test-agent-echo-webhook.json | `test-agent-echo` | `/webhook/test-agent-echo` | `webhook` |
| test-agent-async-waiting.json | `test-agent-async` | `/webhook/test-agent-async` | `webhook` |
| test-agent-async-callback.json | `test-agent-async-callback` | `/webhook/test-agent-async-callback` | `webhook` |

Use **Set up test agent** for the first row only. For the others, create an **Agents** record manually and open **Setup guide** in the sidebar.

## Troubleshooting

- **403 from n8n** — Header Auth credential missing, wrong bearer value, or workflow not published.
- **Payload rejects invocation** — `endpointPath` must be a relative production path; `/webhook-test/` URLs are blocked.
- **Workflow not found after sync** — Workflow inactive in n8n, wrong server API key, or sync not run.
- **Callback workflow fails** — Check `PAYLOAD_PUBLIC_URL`, `N8N_CALLBACK_SECRET`, and that Payload is reachable from n8n.
- **Unused Respond to Webhook** — On the Webhook node, set **Respond** to **Using 'Respond to Webhook' Node**.

## Notes

- These are minimal test workflows, not production agents.
- Node `typeVersion` values target recent n8n releases; n8n may prompt to upgrade nodes after import.
- Chat Trigger samples are not included yet; the harness also supports `chat-trigger` transport with a published Chat Trigger workflow (see [agent-harness-user-guide.md](../agent-harness-user-guide.md)).
