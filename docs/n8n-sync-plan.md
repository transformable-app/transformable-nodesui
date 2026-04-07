# n8n Sync Plan

This project already stores n8n-facing content in the `servers`, `workflows`, `executions`, `credentials`, and `data-tables` collections. The next step is to add a Payload job that reads the self-hosted n8n API and upserts records into those collections.

## Official API references

- API overview: https://docs.n8n.io/api/
- Authentication: https://docs.n8n.io/api/authentication/
- API reference: https://docs.n8n.io/api/api-reference/
- Credentials reference: https://n8n-io-n8n.mintlify.app/api/credentials
- Executions reference: https://www.mintlify.com/n8n-io/n8n/api/executions

The docs show that self-hosted calls authenticate with the `X-N8N-API-KEY` header and typically use `/api/v1/...` routes.

## Why the schema changed

Remote IDs from n8n are only unique inside a single n8n instance. A Payload schema that marks `workflowID`, `executionID`, or `credentialID` as globally unique will eventually fail when two servers reuse the same remote ID.

To make imports idempotent and multi-server-safe, each synced collection now has a `sourceKey` field:

- Workflows: `<server-slug>:<workflowID>`
- Executions: `<server-slug>:<executionID>`
- Credentials: `<server-slug>:<credentialID>`
- Data tables: optional `<server-slug>:<table-key>`

The collections also now keep sync metadata such as `lastSeenAt`, remote timestamps, and redacted raw API payloads for debugging.

## Recommended job shape

Create one Payload job task that accepts:

```ts
type N8nSyncInput = {
  serverID?: string
  resources?: Array<'workflows' | 'executions' | 'credentials' | 'dataTables'>
  fullResync?: boolean
}
```

Recommended execution flow:

1. Load target `servers` with `syncEnabled=true`.
2. For each server, mark `lastSyncStatus='running'` and stamp `lastSyncedAt`.
3. Build a base client from `baseURL`, `apiPath`, and `apiKey`.
4. Fetch each resource page-by-page from the n8n API.
5. Upsert into Payload using `sourceKey` as the unique lookup value.
6. Stamp `lastSeenAt` on every touched record.
7. After a successful resource pass, soft-prune stale records not seen in the current run.
8. Write `lastSuccessfulSyncAt` and clear `lastSyncError`.
9. On failure, set `lastSyncStatus='error'` and persist the error text on the server document.

## Resource mapping

### Servers

This is the manual source-of-truth collection. The sync job should update runtime health fields only:

- `healthSummary`
- `lastSyncedAt`
- `lastSuccessfulSyncAt`
- `lastSyncStatus`
- `lastSyncError`
- `syncCursor`

### Workflows

Primary endpoint:

- `GET /api/v1/workflows`

Suggested mapping:

- `workflowID` <- `id`
- `sourceKey` <- `${server.slug}:${id}`
- `name` <- `name`
- `active` <- `active`
- `status` <- derived from `active` and sync health
- `tags` <- tag names
- `versionID` <- `versionId`
- `projectID` <- `projectId` when available
- `nodeCount` <- `nodes.length`
- `settings` <- `settings`
- `remoteCreatedAt` <- `createdAt`
- `remoteUpdatedAt` <- `updatedAt`
- `n8nURL` <- `${dashboardURL || baseURL}/workflow/${id}`
- `apiData` <- redacted raw response

### Executions

Primary endpoint:

- `GET /api/v1/executions`

Suggested mapping:

- `executionID` <- `id`
- `sourceKey` <- `${server.slug}:${id}`
- `workflow` <- related workflow by `sourceKey`
- `status` <- `status`
- `mode` <- `mode`
- `startedAt` <- `startedAt`
- `finishedAt` <- `stoppedAt`
- `waitTill` <- `waitTill`
- `retryOf` <- `retryOf`
- `durationMS` <- derived from timestamps when both exist
- `errorMessage` <- summarized from execution error payload
- `payloadPreview` <- compact execution summary
- `apiData` <- raw execution payload

Because executions can grow quickly, add a retention rule before production use. Two practical options are:

- keep only the newest N executions per server
- keep only executions newer than X days

### Credentials

Primary endpoints:

- `GET /api/v1/credentials`
- `GET /api/v1/credentials/:credentialId?includeData=true`

Suggested mapping:

- `credentialID` <- `id`
- `sourceKey` <- `${server.slug}:${id}`
- `name` <- `name`
- `credentialType` <- `type`
- `isGlobal` <- `isGlobal`
- `isManaged` <- `isManaged`
- `scopes` <- `scopes`
- `remoteCreatedAt` <- `createdAt`
- `remoteUpdatedAt` <- `updatedAt`
- `dataPreview` <- redacted `data`

Only store redacted payloads from the API. Do not try to persist secrets outside n8n.

### Data tables

n8n documents Data Tables as a native product concept, and the API reference includes a Data Table tag. That means we should treat `data-tables` as a first-class sync target alongside workflows, executions, and credentials.

The Payload collection should mirror the n8n table model:

- `tableID` <- n8n table id
- `sourceKey` <- `${server.slug}:${tableID}`
- `projectID` <- n8n project or personal-space id
- `scope` <- `project` or `personal`
- `columns[].columnID` <- column id
- `columns[].name` <- n8n column name
- `columns[].type` <- one of `string | number | boolean | date | json`
- `columns[].index` <- column order
- `rows` <- row payloads including system columns like `id`, `createdAt`, and `updatedAt`
- `rowShape` <- whether we store plain column maps or richer n8n row envelopes
- `remoteCreatedAt` / `remoteUpdatedAt` <- table timestamps

Suggested sync pattern:

1. List tables with `GET /data-tables`, following `nextCursor` until exhausted.
2. Upsert table metadata by `sourceKey`.
3. For each table, fetch rows with `GET /data-tables/{dataTableId}/rows`, again following `nextCursor`.
4. Store the returned rows as-is so system row metadata is preserved.
5. Normalize columns so legacy `key/label` values still work in the frontend viewer.
6. Recompute `rowCount` in the existing `beforeChange` hook.

Important API details from the OpenAPI spec:

- Table list response shape: `{ data: dataTable[], nextCursor }`
- Row list response shape: `{ data: dataTableRow[], nextCursor }`
- Table filtering uses a JSON-string `filter` query parameter
- Row filtering uses a structured JSON-string filter with `type`, `filters`, `columnName`, `condition`, and `value`
- Supported row filter conditions include `eq`, `neq`, `like`, `ilike`, `gt`, `gte`, `lt`, and `lte`
- Row write endpoints also exist for insert/update/upsert/delete, but our first job should stay read-only and mirror n8n into Payload

## Payload implementation notes

- Use the Local API with `overrideAccess: false` whenever a user is supplied.
- For job-owned server-side sync work, omit `user` and run intentionally with administrative access.
- If you call nested Payload operations from hooks, pass `req` through to preserve transaction boundaries.

## Suggested implementation order

1. Add a reusable `fetchN8n` helper for auth, pagination, and error handling.
2. Add pure mapping functions from n8n responses to Payload data.
3. Register a Payload job task for one server/resource batch.
4. Add an admin action or endpoint that queues a sync for one server.
5. Add scheduled execution using your preferred trigger:
   - Payload jobs endpoint plus external cron
   - n8n calling Payload back on a schedule
   - platform cron hitting a protected route

## First job to build

Start with workflows only. They are the lowest risk, give the dashboard immediate value, and establish the upsert pattern we can reuse for executions and credentials.

## Current implementation

This repo now includes a read-only n8n sync path exposed as:

- `POST /api/n8n/sync/data-tables`
- Payload job task `n8n-sync`

Optional query params:

- `serverID` to sync a single Payload `servers` document
- `resource=workflows|credentials|executions|dataTables|all`

Job input:

- `serverID` to sync a single Payload `servers` document
- `resources` to sync a subset of `workflows`, `credentials`, `executions`, and `dataTables`

Job schedule:

- Runs on queue `n8n`
- Defaults to every 15 minutes
- Override with `N8N_SYNC_CRON`
- Enable in-process job running with `PAYLOAD_JOBS_AUTORUN=true`
- Override the auto-run scheduler with `PAYLOAD_JOBS_AUTORUN_CRON`

Authentication:

- logged-in Payload user
- or `Authorization: Bearer <CRON_SECRET>`

Behavior:

- loads enabled servers
- syncs resources in this order: workflows, credentials, executions, data tables
- pulls paginated workflow metadata from `/api/v1/workflows`
- pulls paginated credential metadata from `/api/v1/credentials`
- pulls paginated executions from `/api/v1/executions`
- pulls paginated table metadata from `/api/v1/data-tables`
- pulls paginated rows from `/api/v1/data-tables/{dataTableId}/rows`
- upserts Payload collections by `sourceKey`
- updates server sync status fields
