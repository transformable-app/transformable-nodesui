# Monitoring & Dashboard Testing

This guide verifies the non-agent collection groups: n8n connectivity, synced data, dashboards/blocks, access control, users/roles, media, forms, and the admin globals. For the agent harness, see [n8n-agent-harness-testing.md](./n8n-agent-harness-testing.md). For runners, commands, and how to add automated tests, see [testing.md](./testing.md).

## Prerequisites

- Run the app with Node 22 (`pnpm dev`) and an admin user.
- For sync tests, have one reachable n8n instance with an API key, or create records manually to test rendering only.
- Set the relevant env vars: `PAYLOAD_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SERVER_URL`, `CRON_SECRET`, `PREVIEW_SECRET`.

## Validate The Build

```bash
pnpm generate:types
pnpm generate:importmap
pnpm exec tsc --noEmit
```

Expected: all commands exit successfully. Run these after any collection, block, global, or access change.

## Bootstrap Checks

On a fresh database, after creating the first user:

- The first user is automatically assigned the `Admin` role.
- The `roles` collection contains `Admin` and `User`.
- If no dashboards exist, an issue-report form and a default dashboard page are seeded, and a sidebar nav item is created for it.

## Servers And Sync

### Register a server

In admin, create a **Server** with `name`, `baseURL`, `apiPath` (`/api/v1`), `apiKey`, and `syncEnabled` checked.

- Confirm `apiKey` renders as a masked secret field and is only visible to Admins.
- Confirm `baseURL`/`apiPath`/`dashboardURL` are not returned to unauthenticated API reads.

### Trigger a manual sync

```bash
# As a logged-in user (browser console)
await fetch('/api/n8n/sync?resource=workflows', { method: 'POST' }).then((r) => r.json())

# Or with the cron secret (no user)
curl -X POST 'http://localhost:3000/api/n8n/sync?resource=all' \
  -H "authorization: Bearer $CRON_SECRET"
```

Expected:

- HTTP `200` with `{ ok: true, resource, ... }`.
- `workflows`, `credentials`, `executions`, and `data-tables` records are upserted by `sourceKey` (no duplicates on re-run).
- The server's `lastSyncStatus`, `lastSyncedAt`, and `lastSuccessfulSyncAt` update.

Negative cases:

- `?resource=bogus` returns `400`.
- Unauthenticated request with a missing/wrong `CRON_SECRET` returns `401`.
- `?serverID=<id>` scopes the sync to one server.

### `n8n-sync` job

With `PAYLOAD_JOBS_AUTORUN=true`, confirm the job runs on the `n8n` queue on the configured schedule (`N8N_SYNC_CRON`). Inspect the `payload-jobs` collection in admin.

## Data Table Row Behavior

- Create a **Data Table** with at least one column, then add **Data Table Rows**.
- Confirm row `data` is filtered to the table's column keys (extra keys dropped, missing keys set to `null`).
- Confirm the table's `rowCount` updates after row create and delete.

## Access Control Matrix

Verify reads from an unauthenticated API client (for example, `GET /api/<collection>`):

| Collection | Unauthenticated read | Notes |
| --- | --- | --- |
| `servers`, `workflows`, `executions`, `data-tables`, `data-table-rows`, `media` | Allowed | Field restrictions still apply |
| `credentials` | Denied | Authenticated only |
| `pages` (Dashboards) | Published + no `requiredRole` only | Role-gated pages hidden |
| `users`, `roles` | Denied | Authenticated, role-restricted |

Field-level checks:

- `servers.apiKey` is omitted for non-admins; `baseURL`/`apiPath`/`dashboardURL` omitted for unauthenticated reads.
- `executions.errorStack`/`payloadPreview`/`apiData` and `workflows.settings`/`apiData` are omitted for unauthenticated reads.

Role checks:

- A **Content Manager** or **Customer** user can only read their own `users` record. A **Content Manager** additionally does not see Users, Roles, Media, Dashboards, or the globals in the admin nav (nav hiding keys off the Content Manager role; Customer is blocked by access control).
- A non-admin user sees a role-gated dashboard only when its `requiredRole` matches one of their roles.

## Dashboards And Blocks

For each block, add it to a dashboard `layout`, publish, and load the frontend page:

- **Servers Status List** - respects `limit`, `statuses`, `showEnvironment`.
- **Workflows List** / **Latest Executions** / **Credentials Health** - respect `server` filter, `pagingMode` (preview vs pagination), and `limit`.
- **Execution Errors** - shows only failed executions.
- **Data Table Viewer** - renders the selected table with `defaultSort` and `pageSize`.
- **Form** - renders the selected Form Builder form and accepts a submission.
- **Chat Embed** - renders the iframe at the configured `embedURL`/`height`.

Also confirm:

- Editing a dashboard revalidates the frontend page and keeps the sidebar nav item in sync.
- Draft autosave, live preview, and scheduled publish work on the Dashboards collection.

## Users, Roles, Media, Globals

- Creating/deleting users and roles is blocked for Content Manager/Customer.
- Assigning roles updates the user's derived `roleNames`.
- Media uploads generate the configured image sizes and are served from `public/media`.
- Updating the **Admin** and **Sidebar** globals revalidates the frontend; both are read-restricted for Content Manager/Customer.

## Jobs Reset

```bash
await fetch('/api/jobs/reset', { method: 'POST' }).then((r) => r.json())
```

Expected: `{ ok: true }` for an authenticated user; `401` when unauthenticated. The `payload-jobs` collection is cleared and job stats reset.

## Automated Coverage

Today these flows are verified manually. The integration suite (`tests/int/`) currently covers agent adapters and a Payload boot smoke test; the e2e suite (`tests/e2e/`) loads the homepage. Good first automated tests to add for this area:

- Access-control assertions per collection using `payload.find({ user, overrideAccess: false })` for unauthenticated, owner, Content Manager, and Admin cases.
- The data-table-row `beforeChange` filtering and `rowCount` recompute hooks.
- The `readPublishedDashboards` constraint for public vs role-gated pages.

See [testing.md](./testing.md) for how to write integration and e2e tests.
