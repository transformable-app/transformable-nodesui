# Testing Guide

This guide documents the testing setup as it currently exists in the repo: the integration (Vitest) and end-to-end (Playwright) test runners, how to run them, what is covered today, and how to add new tests.

For manual, feature-level verification guides see:

- [n8n-agent-harness-testing.md](./n8n-agent-harness-testing.md) - the agent harness.
- [monitoring-testing.md](./monitoring-testing.md) - n8n connectivity, synced data, dashboards/blocks, access control, users/roles, media, and globals.

## Test Stack

| Layer | Tool | Config | Location | Pattern |
| --- | --- | --- | --- | --- |
| Integration | [Vitest](https://vitest.dev) | `vitest.config.mts` | `tests/int/` | `*.int.spec.ts` |
| End-to-end | [Playwright](https://playwright.dev) | `playwright.config.ts` | `tests/e2e/` | `*.e2e.spec.ts` |

- Vitest runs in the `node` environment with `vitest.setup.ts` as a setup file and resolves TypeScript path aliases (`@/...`) via `vite-tsconfig-paths`.
- Playwright runs against Chromium, auto-starts the app with `pnpm dev` on `http://localhost:3000` (reusing an existing server if one is running), retries twice on CI, and emits an HTML report.

## Commands

```bash
# Run everything (integration then e2e)
pnpm test

# Integration tests only (Vitest)
pnpm test:int

# End-to-end tests only (Playwright)
pnpm test:e2e
```

The scripts wrap the runners with `cross-env NODE_OPTIONS=--no-deprecation`. The e2e script additionally sets `--no-experimental-strip-types`.

> **Node version:** use Node 22 for local validation. Node 20 can hit an `undici` runtime mismatch during Payload CLI commands.

## Pre-Test Validation

Before relying on the test suites after schema or component changes, regenerate artifacts and type-check (per `AGENTS.md`):

```bash
pnpm generate:types
pnpm generate:importmap
pnpm exec tsc --noEmit
```

`tsc --noEmit` is the fastest way to catch breakage from collection, hook, or component edits and should pass before running the suites.

## What Is Covered Today

### Integration tests (`tests/int/`)

- **`agentAdapters.int.spec.ts`** - Pure-function coverage of the agent harness adapters and endpoint builder:
  - `buildChatTriggerBody` maps the harness invocation to n8n Chat Trigger metadata.
  - `buildWebhookBody` keeps the canonical harness envelope.
  - `parseChatTriggerResponse` / `parseWebhookResponse` normalize n8n responses, including `waiting`.
  - `buildAgentEndpoint` rejects n8n test webhook paths.
  - `assertSameServerURL` allows same-origin resume URLs and rejects cross-origin ones.
- **`testAgentSetup.int.spec.ts`** - Pure-function coverage of test-agent onboarding helpers: endpoint-path normalization, workflow matching heuristics, the canonical n8n response example, and sample workflow download metadata.
- **`api.int.spec.ts`** - Boots Payload via `getPayload({ config })` and asserts a basic `payload.find({ collection: 'users' })` works. This is the template smoke test and the main example of a Payload-backed integration test.

### End-to-end tests (`tests/e2e/`)

- **`frontend.e2e.spec.ts`** - Loads the homepage and asserts the page title and `h1`. This is the starter template test and currently asserts the default "Payload Website Template" content.

### Coverage gaps

These behaviors are implemented in the app but not yet covered by automated tests; they are verified manually today (see the harness testing guide):

- Authenticated harness endpoints (session create, message send/stream, history, cancel, feedback, approvals, callbacks).
- Access-control constraints (unauthorized, wrong-role, owner, and Admin cases).
- n8n sync job behavior and resource upserts.
- Rate limiting, idempotency, and reconciliation/retention jobs.
- Frontend dashboard blocks and role-gated page access.

The frontend e2e test asserts the default template title, so update it to match the deployed dashboard branding when adding real coverage.

## Adding Tests

### A new integration test

1. Create `tests/int/<name>.int.spec.ts`.
2. Import from `vitest` and use `@/...` path aliases.
3. For pure logic (adapters, access helpers, URL/secret handling, schema validation), import the function directly and assert behavior - no database needed. This is the cheapest and most valuable layer for the harness security/validation surface.
4. For Payload-backed tests, boot Payload once in `beforeAll`:

```ts
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { beforeAll, describe, expect, it } from 'vitest'

let payload: Payload

describe('my feature', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('does the thing', async () => {
    // Pass `user` + `overrideAccess: false` to exercise access control.
  })
})
```

Payload-backed tests require a reachable `DATABASE_URL` (MongoDB) and the standard env vars (`PAYLOAD_SECRET`, etc.). Prefer the pure-function layer when a test does not genuinely need the database.

### A new e2e test

1. Create `tests/e2e/<name>.e2e.spec.ts`.
2. Import `test`/`expect` from `@playwright/test`.
3. Navigate with `page.goto('http://localhost:3000/...')` and assert on locators.
4. Playwright starts the dev server automatically; ensure required env vars are present (it loads `.env` via `dotenv/config`).

## CI Notes

- `forbidOnly` is enabled on CI, so a stray `test.only` fails the build.
- Playwright retries twice and runs a single worker on CI for stability.
- Run `pnpm exec tsc --noEmit` in CI before the suites to fail fast on type regressions.
