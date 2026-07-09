---
name: integration-project-structure
description: |
  Use when scaffolding or navigating a Skedyul integration app: required files, directory layout,
  entry points, and where each concern lives.
---

# Integration Project Structure

## SDK docs

- `node_modules/skedyul/docs/configuration.md` — recommended layout
- `node_modules/skedyul/docs/server.md` — `server.create()` entry
- `node_modules/skedyul/docs/cli.md` — `skedyul build`, `skedyul dev`

## Required files

```
my-integration/                 # projectDirectory root
├── package.json                # "skedyul": "<pinned version>", NOT workspace:*
├── skedyul.config.ts           # defineConfig — metadata + dynamic imports
├── tsconfig.json
├── src/
│   ├── registries.ts           # toolRegistry + webhookRegistry exports
│   ├── server/
│   │   └── mcp_server.ts       # server.create(), hooks, handler export
│   ├── tools/                  # one file per tool (snake_case export names)
│   ├── webhooks/               # one file per webhook handler
│   ├── provision/              # OR top-level provision/ (both patterns exist)
│   │   ├── index.ts            # default ProvisionConfig export
│   │   ├── env.ts              # defineEnv
│   │   ├── models/             # defineModel per file
│   │   ├── pages/              # definePage per route
│   │   ├── pages/navigation.ts # defineNavigation
│   │   └── relationships.ts
│   ├── lib/                    # shared helpers (clients, parsers)
│   └── events/                 # optional: catalog JSON, schemas (BFT)
└── jest.config.js              # optional tests
```

Vetnostics nests CRM under `src/provision/crm/`; BFT uses `src/provision/models/`. Both aggregate in `provision/index.ts`.

## package.json essentials

```json
{
  "type": "module",
  "main": "./src/registries.ts",
  "scripts": {
    "build": "skedyul build"
  },
  "dependencies": {
    "skedyul": "1.4.5"
  }
}
```

## Entry points

| File | Role |
|------|------|
| `skedyul.config.ts` | Declarative config for deploy/provision |
| `src/registries.ts` | Tool + webhook maps for MCP |
| `src/server/mcp_server.ts` | Runtime server; wires registries + hooks |

`mcp_server.ts` pattern (BFT):

```ts
import { server } from 'skedyul'
import { toolRegistry, webhookRegistry } from '../registries'
import installHandler from './hooks/install'
import provisionHandler from './hooks/provision'

const skedyulServer = server.create({
  name: 'My App',
  version: pkg.version,
  computeLayer: 'serverless',
  tools: toolRegistry,
  webhooks: webhookRegistry,
  hooks: { install: installHandler, provision: provisionHandler },
})

export const handler = 'handler' in skedyulServer ? skedyulServer.handler : undefined
```

## Where to put new code

| Concern | Location |
|---------|----------|
| MCP tool | `src/tools/<name>.ts` → register in `registries.ts` |
| Webhook handler | `src/webhooks/<name>.ts` → `webhookRegistry` |
| CRM model | `src/provision/models/<model>.ts` |
| Admin page | `src/provision/pages/<route>.ts` |
| Install/provision/uninstall | `src/server/hooks/` |
| External API client | `src/lib/` |
| App events catalog | `src/events/` + `events` in config |

## Reference examples (read-only)

- **Public:** `integrations/integrations/email/` — full-stack public integration (channels, webhooks, install)
- **Private BFT:** `private-integrations/integrations/bft/` — events, developer tools, provision webhooks
- **Private Vetnostics:** `private-integrations/integrations/vetnostics/` — AI parsing tool, shared models, minimal webhooks

## Anti-patterns

- **Do not edit reference clones** — they are read-only pattern libraries
- **Do not use `workspace:*` for `skedyul`** — integrations ship as standalone npm apps
- **Only edit `projectDirectory`** — not monorepo siblings or reference repos
- **Do not put tools inline in `mcp_server.ts`** — keep one tool per file
- **Do not skip `registries.ts`** — build expects named exports `toolRegistry` / `webhookRegistry`
- **Do not mix provision into `skedyul.config.ts`** — keep `provision: import('./src/provision')`

## Verify structure

```bash
pnpm install
pnpm exec skedyul dev validate
pnpm build
```
