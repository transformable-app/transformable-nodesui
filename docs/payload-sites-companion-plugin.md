# NodesUI Companion Plugin

Target Payload sites must install the NodesUI companion plugin before NodesUI can generate CMS drafts for them. NodesUI uses this plugin to fetch a sanitized schema profile, then validates every generated `cms-draft` task against that profile before making remote writes.

## Install

Install the companion package in the target Payload site, then add it to that site's Payload config. Until the package is published to npm, install it from the dedicated GitHub repository.

```sh
pnpm add @transformable/nodesui-payload-companion@git+https://github.com/transformable-app/transformable-nodesui-payload-plugin.git#main
```

For production sites, pin a tag or commit instead of `main`.

```ts
import { buildConfig } from 'payload'
import { nodesUICompanionPlugin } from '@transformable/nodesui-payload-companion'

export default buildConfig({
  plugins: [
    nodesUICompanionPlugin({
      writableCollections: ['pages', 'media'],
    }),
  ],
})
```

The target site also needs Payload API key auth enabled on the configured auth collection, usually `users`, and a restricted API key user that can read the schema profile, create/update drafts, and upload media only for approved collections.

The package source is intended to live at `https://github.com/transformable-app/transformable-nodesui-payload-plugin` and follows Payload's plugin template shape: package metadata at the package root, plugin source in `src`, and compiled output in `dist` for publishing.

## Endpoint

The plugin exposes:

```txt
GET /api/nodesui/schema-profile
```

NodesUI calls this endpoint with Payload API key auth:

```txt
Authorization: users API-Key <target-site-api-key>
```

The endpoint returns generation-safe metadata only. It must not expose secrets, access-control functions, server config, or private runtime values.

The profile may include review URL templates:

```json
{
  "urlTemplates": {
    "admin": "/admin/collections/{collection}/{id}?version={versionID}",
    "preview": "/preview/{collection}/{id}?locale={locale}&tenant={tenant}"
  }
}
```

NodesUI resolves these templates after a remote draft write and stores the resulting links on `agent-runs.remoteDraft.adminURL` and `agent-runs.remoteDraft.previewURL`. Supported tokens are `{collection}`, `{id}`, `{versionID}`, `{locale}`, and `{tenant}`. If no `admin` template is present, NodesUI falls back to the Payload Site `Admin URL`.

## Profile Shape

The response is wrapped as:

```json
{
  "schemaProfile": {
    "plugin": {
      "name": "nodesui-companion",
      "version": "0.1.0",
      "compatible": true
    },
    "capabilities": {
      "drafts": true,
      "uploads": true
    },
    "collections": []
  }
}
```

Each collection profile includes:

- `slug`
- `labels`
- `draftSupport`
- `versions`
- `upload`
- `fields`
- `fieldPaths`
- `blocks`

NodesUI stores the profile on `payload-sites`, computes a hash, and blocks write-back when the companion plugin is missing, incompatible, failing, or the schema profile is stale.

## NodesUI Setup

In NodesUI Admin:

1. Create a `Payload Site`.
2. Set `Base URL`, `API Key Auth Collection`, and `API Key Secret Reference`.
3. Use **Check companion plugin**.
4. Use **Sync schema profile**.
5. Review allowed collections, field allowlists, media policy, and schema profile status.
6. Enable write-back only after review.

Generated drafts are always written through the target site's Payload API, never through NodesUI's Local API.
