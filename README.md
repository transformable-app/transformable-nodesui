# transformable-nodesui

Dashboard-focused Payload CMS app for monitoring n8n instances. It stores synced server, workflow, execution, credential, and data table metadata in Payload, then renders configurable dashboard pages with filters, pagination, chat embeds, and forms.

Built with [Payload CMS](https://payloadcms.com)

## Features

- **n8n server inventory** - Track multiple n8n instances with environment, health, API path, sync status, and admin-only API keys.
- **Synced operational data** - Import workflows, credentials, executions, and data tables from one or more n8n servers on a schedule or on demand.
- **Dashboard builder** - Compose frontend dashboard pages from Payload blocks such as server status lists, workflow lists, execution error panels, credential health views, data table viewers, chat embeds, and forms.
- **Role-aware access** - Restrict dashboard pages to specific roles, support admin/content-manager/customer distinctions, and protect sensitive fields.
- **Jobs and endpoints** - Run scheduled Payload jobs for n8n sync, trigger syncs manually through the admin or API, and reset the jobs queue from the admin.
- **Admin customization** - Configure admin branding, login content, sidebar navigation, and dashboard welcome content from globals.

## Quick Start

1. Clone the repo and create a `.env` in the project root. Set at least:
   - `DATABASE_URL` - MongoDB connection string
   - `PAYLOAD_SECRET` - secret for Payload auth and encryption
   - `NEXT_PUBLIC_SERVER_URL` - public URL of the app, for example `http://localhost:3000`
   - `CRON_SECRET` - bearer token for cron/job endpoints
   - `PREVIEW_SECRET` - secret used for preview routes
   Optionally set:
   - `PAYLOAD_JOBS_AUTORUN=true` and `PAYLOAD_JOBS_AUTORUN_CRON` to let the app execute scheduled jobs in-process
   - `N8N_SYNC_CRON` to override the default sync cadence
   - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` if you use forms with reCAPTCHA
   - `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_RELEASE` for Sentry
2. Install dependencies and start the dev server:
   ```bash
   pnpm install
   pnpm dev
   ```
3. Open `http://localhost:3000/admin`, create the first admin user, then add one or more **Servers** entries so the sync job has an n8n API to talk to.
4. Create or edit a **Dashboard** page and add blocks such as **Servers Status List**, **Workflows List**, **Latest Executions**, **Execution Errors**, **Credentials Health**, **Data Table Viewer**, **Chat Embed**, or **Form**.

## Collections

Public read access varies by collection. Sensitive operations are restricted to authenticated users, and some fields are further hidden from non-authenticated viewers.

### Dashboards

Stored in the `pages` collection and labeled as Dashboards in the admin.

- **Title / Description / Slug** - Core page metadata and frontend route.
- **Required Role** - Optional role gate for the frontend dashboard page. Admins can always access restricted pages.
- **Layout** - Block-based dashboard builder with monitoring widgets, data table viewers, embeds, and forms.
- **SEO** - Metadata powered by the Payload SEO plugin.
- **Drafts and preview** - Draft-enabled with live preview and scheduled publishing.

When dashboards change, revalidation hooks update the frontend and a hook keeps the sidebar navigation in sync.

### Servers

n8n instances to monitor and sync from.

- **Name / Environment / Status** - Basic identity and operational state.
- **Base URL / API Path / Dashboard URL** - Connection and navigation details for the target n8n instance.
- **API Key** - Stored for sync operations and only readable by authenticated users.
- **Sync Enabled** - Whether jobs should import data from this server.
- **Sync state** - Last sync timestamps, status, error, and opaque cursor data for incremental jobs.

### Workflows

Workflow metadata imported from n8n.

- **Workflow ID / Source Key** - External identifier plus a globally unique sync key.
- **Server** - Which n8n server the workflow belongs to.
- **Status / Active / Tags** - Operational state and labels.
- **n8n URL** - Direct link back to the workflow in n8n.
- **Execution and remote timestamps** - Useful for recent activity dashboards.
- **API Data** - Raw sync payload for debugging and auditing.

### Executions

Execution runs imported from n8n.

- **Execution ID / Source Key** - External identifier plus the unique sync key.
- **Server / Workflow** - Relationships back to the originating resources.
- **Status / Mode / Retry Of** - Runtime metadata.
- **Started / Finished / Wait Till / Duration** - Timing information for dashboards and diagnostics.
- **Error Message / Error Stack** - Failure data, with stack visibility limited to authenticated users.
- **Payload Preview / API Data** - Stored payload snapshots for troubleshooting.

### Credentials

Credential records imported from n8n.

- **Name / Credential ID / Source Key** - Identity and sync key.
- **Credential Type / Server** - Classification and source server.
- **Health flags** - `isHealthy`, `isGlobal`, and `isManaged`.
- **Scopes / last used / remote timestamps** - Operational metadata for reporting.
- **Data Preview** - Redacted credential payload when available from the sync.

Credential records are only readable and editable by authenticated users.

### Data Tables

Table definitions for datasets sourced from n8n.

- **Name / Slug / Table ID / Source Key** - Identity for routing and sync upserts.
- **Server / Project ID / Scope** - Ownership and source context.
- **Columns** - Schema metadata used by the frontend table viewer.
- **Row Count / Refresh timestamps** - Read-only and sync-populated operational fields.

### Data Table Rows

Rows stored separately from table definitions for scalable viewing and filtering in dashboard blocks.

- **Row ID / Row Index** - External and local ordering metadata.
- **Table** - Relationship to a `data-tables` entry.
- **Data** - JSON payload for the actual row values.
- **Remote timestamps** - Source-system created and updated dates.

### Roles

User roles such as `Admin` and `User`. The app ensures baseline roles exist on init, and additional roles can be used to gate dashboard access.

### Users

Auth-enabled Payload users.

- **Roles / Role Names** - Stored in JWT-friendly form for fast access checks.
- **API keys** - Enabled via Payload auth configuration.
- **Restricted manager behavior** - Some roles are intentionally limited to self-only reads or hidden admin views.

### Media

Uploads used by dashboard pages, header assets, admin branding, and SEO metadata.

## Globals

### Admin (`admin-settings`)

Admin panel branding and login/dashboard presentation.

- **Admin icon** - Small icon shown in the admin nav and browser tab.
- **Login screen** - Logo, welcome content, and whether frontend account creation is enabled.
- **Dashboard banner** - Rich text content and optional light/dark color overrides.

### Sidebar (`header`)

Global navigation and head metadata for the frontend dashboard shell.

- **Logo / favicon / apple touch icon** - Shared brand assets.
- **Header scripts / meta tags** - Raw HTML inserted into the head.
- **Dashboard sidebar label and text** - Branding shown in the dashboard sidebar.
- **Hide dashboard sidebar** - Toggle the desktop sidebar off.
- **Nav items** - Configurable links rendered in the frontend navigation.

### Jobs (`jobs`)

Admin-facing view that documents the active job schedule and provides a queue reset action.

## Access control

- **Dashboards** - Public users can read published dashboards that are not role-restricted; authenticated users can create, update, and delete. Some roles are intentionally limited.
- **Servers, Workflows, Executions, Data Tables** - Publicly readable for frontend dashboard rendering, but create/update/delete requires authentication.
- **Credentials** - Authenticated users only.
- **Roles, Users, Jobs, admin-settings** - Restricted to authenticated users, with extra role-based limitations.
- **Sensitive fields** - Server API keys and execution error stacks are further protected at the field level.

## Jobs and schedule

- **n8n-sync** - Imports workflows, credentials, executions, and data tables from enabled n8n servers. By default it runs every 15 minutes using `N8N_SYNC_CRON=0 */15 * * * *`.

Payload job execution is allowed for logged-in users or requests that include the correct `CRON_SECRET` as `Authorization: Bearer <CRON_SECRET>`.

When `PAYLOAD_JOBS_AUTORUN=true`, the app automatically processes queues in-process using `PAYLOAD_JOBS_AUTORUN_CRON`, which defaults to `* * * * *`.

There are also manual endpoints:

- `POST /api/n8n/sync` - Sync all supported resources, or a specific resource via `?resource=workflows|credentials|executions|dataTables|all`
- `POST /api/n8n/sync/data-tables` - Alias to the same sync handler
- `POST /api/jobs/reset` - Clear `payload-jobs` and reset job stats; requires an authenticated user

You can also scope a sync to one server with `?serverID=<payload-server-id>`.

## Development

- `pnpm dev` - Start the Next.js dev server with Payload mounted at `/admin`
- `pnpm build` - Production build
- `pnpm start` - Run the production server
- `pnpm generate:types` - Regenerate Payload types after schema changes
- `pnpm generate:importmap` - Regenerate the admin import map after adding or changing admin components
- `pnpm lint` - Run Next.js linting
- `pnpm test:int` - Run Vitest integration tests
- `pnpm test:e2e` - Run Playwright end-to-end tests

For local development you can use a local MongoDB instance, or Docker Compose for both the app and MongoDB.

## Docker

### Run with Docker Compose

The repo includes a production-oriented Compose setup for the app and MongoDB:

1. Set the required environment variables in `.env`: `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CRON_SECRET`, and `PREVIEW_SECRET`.
2. Optionally set `PAYLOAD_JOBS_AUTORUN`, `PAYLOAD_JOBS_AUTORUN_CRON`, `N8N_SYNC_CRON`, reCAPTCHA keys, and Sentry env vars.
3. Run:
   ```bash
   docker-compose up
   ```
4. Open `http://localhost:3000/admin` and create your first user.

Compose uses `ghcr.io/transformable-app/transformable-nodesui:latest` by default and can be overridden with `TRANSFORMABLE_NODESUI_IMAGE`.

### Docker deployment (GHCR)

Images are published to GitHub Container Registry:

- `ghcr.io/transformable-app/transformable-nodesui`

#### Run the published image

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='mongodb://<host>/transformable-nodesui' \
  -e PAYLOAD_SECRET='<secret>' \
  -e NEXT_PUBLIC_SERVER_URL='https://your-domain.example' \
  -e CRON_SECRET='<cron-secret>' \
  -e PREVIEW_SECRET='<preview-secret>' \
  ghcr.io/transformable-app/transformable-nodesui:latest
```

#### Cron jobs in Docker

The image is configured with:

- `PAYLOAD_JOBS_AUTORUN=true`
- `PAYLOAD_JOBS_AUTORUN_CRON=* * * * *`

Task defaults:

- `N8N_SYNC_CRON=0 */15 * * * *`

Override those env vars at runtime if you want a different cadence. If you run multiple app replicas, enable job autorun on only one instance to avoid duplicate syncs.

## Production

1. Set `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CRON_SECRET`, and `PREVIEW_SECRET`.
2. Add optional env vars for jobs, Sentry, and reCAPTCHA as needed by your deployment.
3. Build and start with `pnpm build && pnpm start`, or run the published Docker image.
4. For scheduled jobs, either rely on in-process `PAYLOAD_JOBS_AUTORUN` or call the sync endpoint on a schedule with `Authorization: Bearer <CRON_SECRET>`.

## Platform Questions

For Payload CMS: [Discord](https://discord.com/invite/payload) or [GitHub discussions](https://github.com/payloadcms/payload/discussions).
