# Monitoring & Dashboard User Guide

This guide documents the non-agent collection groups as they are currently implemented: n8n connectivity, synced operational data, dashboards and blocks, access/users, media, forms, and the admin globals. For the agent harness, see [agent-harness-user-guide.md](./agent-harness-user-guide.md). For the n8n import design, see [n8n-sync-plan.md](./n8n-sync-plan.md).

## Roles And Access Model

The app uses a `roles` collection plus a derived `roleNames` array persisted in each user's JWT (`saveToJWT`). Role checks use the `checkRole` helper (JWT-first, case-insensitive).

- **Admin** - Full access. The first user created is automatically assigned the `Admin` role.
- **User** - Standard authenticated user. `Admin` and `User` roles are seeded on startup if missing.
- **Content Manager** / **Customer** - Restricted roles (not seeded by default). Access control excludes both from privileged collections and globals, and limits them to reading only their own user record. The admin-nav `hidden` flag on Users, Roles, Media, Dashboards, and the globals keys off the **Content Manager** role specifically; Customer is blocked by access control rather than by nav hiding.

Common access patterns:

- `anyone` read - public read for frontend rendering.
- `authenticated` - any signed-in user.
- `authenticatedAndNotContentManager` / `adminAuthenticatedAndNotContentManager` - signed-in users excluding Content Manager and Customer.

## n8n Connectivity

### Servers (`servers`)

The manual source-of-truth for each n8n instance you monitor and sync from.

- **Access** - Read: `anyone`. Create/Update/Delete: authenticated.
- **Fields**
  - `name`, `environment` (`production`/`staging`/`development`/`sandbox`), `status` (`online`/`degraded`/`offline`/`unknown`).
  - `baseURL`, `apiPath` (default `/api/v1`), `dashboardURL` - **field-level read restricted to authenticated users**.
  - `apiKey` - **read/update restricted to Admin**, rendered with a masked secret field. Used by the sync job and resolved server-side.
  - `syncEnabled` - whether the sync job imports from this server.
  - Sync state (read-only, job-managed): `healthSummary`, `lastSyncedAt`, `lastSuccessfulSyncAt`, `lastSyncStatus` (`idle`/`running`/`success`/`error`), `lastSyncError`, `syncCursor`.

> Note: `baseURL`, `apiPath`, and `dashboardURL` are field-restricted to authenticated users, but the collection itself is publicly readable. Do not place secrets or internal-only hosts in these fields.

## Synced Operational Data

All synced collections share a `sourceKey` (`<server>:<remoteID>`) for idempotent, multi-server-safe upserts, plus `lastSeenAt` and `remote*` timestamps. They are imported by the `n8n-sync` job or the sync endpoints (see below).

### Workflows (`workflows`)

- **Access** - Read: `anyone`. Create/Update/Delete: authenticated. `settings` and `apiData` fields are read-restricted to authenticated users.
- **Key fields** - `name`, `workflowID`, `sourceKey` (unique), `server`, `status` (`active`/`paused`/`error`/`archived`), `active`, `tags`, `projectID`, `versionID`, `triggerCount`, `nodeCount`, `n8nURL`, `lastExecutionAt`.

### Executions (`executions`)

- **Access** - Read: `anyone`. Create/Update/Delete: authenticated. `errorStack`, `payloadPreview`, and `apiData` are read-restricted to authenticated users (`errorStack` update also restricted).
- **Key fields** - `executionID`, `sourceKey` (unique), `server`, `workflow`, `status` (`success`/`error`/`running`/`waiting`/`canceled`), `mode`, `retryOf`, `waitTill`, `startedAt`, `finishedAt`, `durationMS`, `errorMessage`.

### Credentials (`credentials`)

- **Access** - Read/Create/Update/Delete: authenticated only (not public).
- **Key fields** - `name`, `credentialID`, `sourceKey` (unique), `credentialType`, `server`, `isHealthy`, `isGlobal`, `isManaged`, `scopes`, `lastUsedAt`, `summary`, `dataPreview` (redacted payload from n8n).

### Data Tables (`data-tables`)

- **Access** - Read: `anyone`. Create/Update/Delete: authenticated.
- **Key fields** - `name`, `slug` (unique), `sourceKey` (unique, optional), `tableID`, `server`, `projectID`, `scope` (`project`/`personal`), `columns[]` (with `name`/`type`/`columnID`/`index` and legacy `key`/`label` aliases), `rowCount` (read-only), `lastRefreshedAt`.
- **Behavior** - A `beforeChange` hook normalizes column `name`/`key`/`displayName`/`label` so legacy and new viewers stay compatible.

### Data Table Rows (`data-table-rows`)

Rows are stored separately from table definitions for scalable viewing and filtering.

- **Access** - Read: `anyone`. Create/Update/Delete: authenticated.
- **Key fields** - `table` (relationship), `sourceKey` (unique, optional), `rowID`, `rowIndex`, `data` (JSON object keyed by the parent table's column names).
- **Behavior**
  - `beforeChange` filters `data` down to the parent table's allowed column keys (missing keys become `null`).
  - `afterChange`/`afterDelete` recompute the parent table's `rowCount`. Pass `context.skipTableRowCountSync` to bypass during bulk sync.

## Dashboards

### Dashboards (`pages`)

Stored in the `pages` collection, labeled **Dashboards** in the admin.

- **Access**
  - Read: `readPublishedDashboards` - the public sees published dashboards with no `requiredRole`; signed-in users additionally see published dashboards whose `requiredRole` matches one of their roles; Admins see everything.
  - Create/Update/Delete: authenticated. Admin nav is hidden for Content Manager/Customer.
- **Fields** - `title`, `description`, `requiredRole` (Admin-only field, sidebar), a `layout` blocks builder, an SEO `meta` tab (from the SEO plugin), `publishedAt`, and `slug`.
- **Versioning** - Drafts with autosave, scheduled publish, and live preview (`maxPerDoc: 50`).
- **Hooks** - On change, the frontend page is revalidated and a sidebar nav item is kept in sync; on delete, the page is revalidated.

### Dashboard Blocks

Add these blocks to a dashboard `layout`. All support a `title` and optional `description`; monitoring blocks read public data and most accept a `server` filter and a paging mode (`preview` first page, or `pagination`).

| Block | Slug | Purpose | Notable options |
| --- | --- | --- | --- |
| Servers Status List | `serversStatusList` | Server health cards | `limit` (max 24), `statuses` filter, `showEnvironment` |
| Workflows List | `workflowsList` | Workflows for a server | `server`, `pagingMode`, `limit` (max 30), `showServer` |
| Latest Executions | `latestExecutions` | Recent execution runs | `server`, `workflow`, `pagingMode`, `limit` (max 30) |
| Execution Errors | `executionErrors` | Recent failed executions | `server`, `limit` (max 20) |
| Credentials Health | `credentialsHealth` | Credential health list | `server`, `pagingMode`, `limit`, `onlyUnhealthy` |
| Data Table Viewer | `dataTableViewer` | Render a synced data table | `table` (required), `pagingMode`, `defaultSort`, `pageSize` (5-100) |
| Agent Chat | `agentChat` | First-party agent chat | See the agent harness guide |
| Chat Embed | `chatEmbed` | Iframe an externally hosted n8n chat | `embedURL` (required), `height` (320-1200) |
| Form | `formBlock` | Render a Form Builder form | `form` (required) |

## Media (`media`)

- **Access** - Read: `anyone`. Create/Update/Delete: authenticated. Admin nav hidden for Content Manager.
- **Details** - Folder-enabled uploads with `alt` and rich-text `caption`. Generates thumbnail, square, small, medium, large, xlarge, and `og` (1200x630) sizes. Files are written to `public/media` so they are publicly served.

## Users And Roles

### Users (`users`)

- **Auth** - API key auth enabled (`useAPIKey`); 7-day token expiration. Grouped under the **Globals** admin group.
- **Access** - Admin panel: Admin only. Create/Delete: authenticated and not Content Manager/Customer. Read/Update: authenticated; Content Manager/Customer can only read/update their own record.
- **Fields** - `name`, `roles` (relationship, `saveToJWT`), `roleNames` (hidden, derived, `saveToJWT`).
- **Behavior** - On creating the first user, the `Admin` role is auto-assigned. On every change, `roleNames` is recomputed from the assigned roles for fast JWT-based checks.

### Roles (`roles`)

- **Access** - Admin panel and all operations: authenticated and not Content Manager/Customer. Grouped under **Globals**.
- **Fields** - `name` (required, unique). `Admin` and `User` are seeded on startup if missing.

## Forms (Form Builder plugin)

The `@payloadcms/plugin-form-builder` plugin adds **Forms** and **Form Submissions** collections (grouped under **Globals**), with the payment field disabled. Build a form, then render it on a dashboard with the **Form** block. An issue-report form and a default dashboard page are seeded on first run if no dashboards exist.

## Admin Globals

### Admin (`admin-settings`)

- **Access** - Read: public unless Content Manager/Customer. Update: authenticated and not Content Manager/Customer.
- **Content** - Admin panel icon, login screen (logo, welcome rich text, `allowFrontendCreateAccount`), and dashboard welcome banner content plus optional light/dark color overrides. Changes revalidate the frontend.

### Sidebar (`header`)

- **Access** - Same as Admin global.
- **Content** - `logo`, `favicon`, `appleTouchIcon`, raw `headerScripts`/`metaTags` injected into `<head>`, dashboard sidebar label/text, `hideDashboardSidebar`, and configurable `navItems` links. Changes revalidate the frontend.

## SEO

The `@payloadcms/plugin-seo` plugin adds the SEO meta tab to Dashboards and auto-generates titles (`<title> | n8n Reporting CMS`) and URLs from the page slug.

## Sync: Endpoints And Jobs

### Manual sync endpoints

Authenticated by a logged-in user **or** `Authorization: Bearer <CRON_SECRET>`.

- `POST /api/n8n/sync` - Sync all resources, or one via `?resource=workflows|credentials|executions|dataTables|all`.
- `POST /api/n8n/sync/data-tables` - Alias to the same handler.
- `POST /api/agents/test-setup` - Admin-only. Upserts the canonical `test-agent` record and returns the shared setup guide checklist (does not invoke n8n).
- `POST /api/agents/setup-guide` - Admin-only. Returns the setup guide checklist for agent field values in the JSON body (unsaved create forms).
- `POST /api/agents/:id/setup-guide` - Admin-only. Same checklist for a saved agent record.
- `GET /api/n8n/sample-workflows` - Lists importable harness sample workflow JSON files with download URLs.
- `GET /api/n8n/sample-workflows/:filename` - Downloads a sample workflow file from `docs/n8n-workflows/`.
- Scope to one server with `?serverID=<payload-server-id>` on sync routes; pass `serverID` in the JSON body for test setup.

The handler loads enabled servers and upserts in order: workflows, credentials, executions, data tables. Invalid `resource` values return `400`; failures return `500` with a message.

### `n8n-sync` job

- Runs on the `n8n` queue. Default schedule every 15 minutes (`N8N_SYNC_CRON`).
- Processed in-process when `PAYLOAD_JOBS_AUTORUN=true` (`PAYLOAD_JOBS_AUTORUN_CRON`, default every minute).

### Jobs collection and reset

- The built-in `payload-jobs` collection is visible in the admin (not hidden).
- `POST /api/jobs/reset` clears `payload-jobs` and resets job stats. Requires an authenticated user (`401` otherwise).

## Environment Variables (this area)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB connection string. |
| `PAYLOAD_SECRET` | Payload auth/encryption secret. |
| `NEXT_PUBLIC_SERVER_URL` | Public app URL used for CORS, previews, and SEO URLs. |
| `CRON_SECRET` | Bearer token authorizing the sync endpoints and job runs without a user. |
| `PREVIEW_SECRET` | Secret for dashboard live-preview routes. |
| `N8N_SYNC_CRON` | Override the `n8n-sync` schedule (default `0 */15 * * * *`). |
| `PAYLOAD_JOBS_AUTORUN` / `PAYLOAD_JOBS_AUTORUN_CRON` | Enable and schedule in-process queue processing. |

If you run multiple app replicas, enable job autorun on only one instance to avoid duplicate syncs.
