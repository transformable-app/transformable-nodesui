# NodesUI Payload Companion Plugin

Payload sites must install this companion plugin before NodesUI can generate remote CMS drafts for them. The plugin exposes a sanitized schema profile endpoint that NodesUI uses to validate generated page documents, blocks, fields, and media requests before making remote Payload API writes.

## Install

Install the package in the target Payload site. Until the package is published to npm, install it from the dedicated GitHub repository.

```sh
pnpm add @transformable/nodesui-payload-companion@git+https://github.com/transformable-app/transformable-nodesui-payload-plugin.git#main
```

For production sites, pin a tag or commit instead of `main`.

Then add it to the target site's Payload config.

```ts
import { nodesUICompanionPlugin } from '@transformable/nodesui-payload-companion'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    nodesUICompanionPlugin({
      writableCollections: ['pages', 'media'],
    }),
  ],
})
```

The target site also needs Payload API key auth enabled on the configured auth collection, usually `users`, and a restricted API key user that can read the schema profile, create or update drafts, and upload media only for approved collections.

## Endpoint

By default, the plugin exposes:

```txt
GET /api/nodesui/schema-profile
```

NodesUI calls this endpoint with Payload API key auth:

```txt
Authorization: users API-Key <target-site-api-key>
```

The endpoint returns generation-safe metadata only. It does not expose secrets, access-control functions, server config, or private runtime values.

## Options

```ts
type NodesUICompanionPluginOptions = {
  endpointPath?: string
  pluginVersion?: string
  writableCollections?: string[]
}
```

- `endpointPath` defaults to `/nodesui/schema-profile`.
- `pluginVersion` defaults to the package version.
- `writableCollections` defaults to `['pages', 'media']`.

## Development

This package follows the same structure as Payload's plugin template: package metadata at the root, source in `src`, and a compiled `dist` output for publishing.

```sh
pnpm typecheck
pnpm build
```
