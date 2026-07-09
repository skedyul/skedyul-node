---
name: skedyul-config
description: |
  Use when editing skedyul.config.ts: defineConfig, dynamic registry imports, events catalog,
  computeLayer, env/provision imports, and build settings.
---

# Skedyul Config (`skedyul.config.ts`)

## SDK docs

- `node_modules/skedyul/docs/configuration.md` — full `SkedyulConfig` reference
- `node_modules/skedyul/docs/README.md` — doc index

## Minimal pattern

```ts
import { defineConfig } from 'skedyul'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  handle: 'my_app',           // optional; stable app handle
  name: 'My Integration',
  version: pkg.version,
  description: 'What this app does',
  computeLayer: 'serverless', // or 'dedicated'

  tools: import('./src/registries'),
  webhooks: import('./src/registries'), // same module, exports both registries

  provision: import('./src/provision'),
  // install: import('./install'),      // per-installation config
  // events: [...],                      // app events catalog (see webhooks-events skill)
})
```

## Dynamic registry imports

Use `import()` for `tools`, `webhooks`, `provision`, and `install` so `skedyul build` can tree-shake and defer-load heavy modules.

The imported module must export:

| Config key | Export name |
|------------|-------------|
| `tools` | `toolRegistry` |
| `webhooks` | `webhookRegistry` |
| `provision` | `default` (`ProvisionConfig`) |
| `install` | `default` (`InstallConfig`) |

See BFT: `src/registries.ts` exports both `toolRegistry` and `webhookRegistry`.

## computeLayer

| Value | Runtime |
|-------|---------|
| `serverless` | AWS Lambda (`export const handler`) |
| `dedicated` | Long-running HTTP server (`server.listen`) |

`src/server/mcp_server.ts` may override via `SKEDYUL_COMPUTE_LAYER` or Lambda detection. Config and server entry must agree.

## Events catalog

Declare events your app emits via `event.create` (for workflow UI, CLI testing):

```ts
events: [
  { name: 'member.created', description: 'New member synced from Glofox' },
]
```

Rich catalogs (BFT pattern): maintain `src/events/catalog.json` + examples, map in config:

```ts
import catalogMeta from './src/events/catalog.json' with { type: 'json' }

const events = catalogMeta.map((entry) => ({
  ...entry,
  workflowInputType: `@app/bft/${entry.name.replace(/\./g, '/')}`,
  ...(examplePayload ? { examplePayload } : {}),
}))
```

Test: `skedyul event create member.created '{}' --workplace <subdomain>`

## Env in provision (not config root)

Env vars belong in `provision/env.ts` via `defineEnv`, aggregated by `ProvisionConfig.env` — not inline in `defineConfig`. See `integration-provision` skill.

## Optional config keys

- `build.external` — npm packages to exclude from bundle (`node_modules/skedyul/docs/configuration.md`)
- `queues` — rate-limit queues for `queuedFetch`
- `agents` — provision-time `defineAgent()` entries
- `hooks` — lifecycle handlers (prefer `src/server/mcp_server.ts` for runtime)

## Reference examples (read-only)

- **Public:** the public integrations reference clone at `integrations/integrations/email/` — channels, webhooks, install config
- **Private:** the private integrations reference clone at `private-integrations/integrations/bft/` — events catalog, developer tools, provision hooks

## Anti-patterns

- **Do not edit reference clones** — copy patterns into your `projectDirectory` only
- **Do not use `workspace:*` for `skedyul`** — pin a published version in `package.json` (e.g. `"skedyul": "1.4.5"`)
- **Only edit files under `projectDirectory`** — never touch sibling apps, root lockfiles, or `node_modules`
- **Do not inline large provision/config** — use dynamic imports and modular `src/provision/`
- **Do not omit `version`** — read from `package.json`

## Validate

```bash
pnpm exec skedyul dev validate
pnpm build
```
