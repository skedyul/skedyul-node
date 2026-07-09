# Integration project structure

Standard layout for a Skedyul integration app, based on the **BFT** and **Vetnostics** apps in `packages/skedyul-integrations/private/integrations/`.

## Directory layout

```
my-integration/
├── package.json
├── skedyul.config.ts          # Deploy config (tools, webhooks, provision, events)
├── tsconfig.json
└── src/
    ├── registries.ts          # Tool + webhook registries (single source of truth)
    ├── server/
    │   ├── mcp_server.ts      # Runtime entry point
    │   └── hooks/
    │       ├── install.ts
    │       ├── provision.ts     # optional
    │       └── uninstall.ts     # optional
    ├── provision/
    │   ├── index.ts             # Aggregates ProvisionConfig
    │   ├── env.ts               # optional — provision-scoped secrets
    │   ├── models/              # CRM models
    │   ├── pages/               # UI pages (install + developer)
    │   └── relationships.ts     # optional — CRM relationships
    ├── tools/                   # One file per tool
    ├── webhooks/                # optional — external webhook handlers
    ├── events/                  # optional — app event catalog + schemas
    └── lib/                     # Shared helpers (clients, parsers, etc.)
```

Keep **deploy config** (`skedyul.config.ts`) and **runtime** (`src/server/mcp_server.ts`) separate. Both import from `src/registries.ts` so tool names stay in sync.

---

## `skedyul.config.ts`

The deploy manifest. Loaded by `skedyul build` and `skedyul deploy`.

```ts
import { defineConfig } from 'skedyul'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  handle: 'my_app',              // URL-safe app identifier
  name: 'My Integration',
  version: pkg.version,
  description: 'What this app does',
  computeLayer: 'serverless',    // or 'dedicated'

  tools: import('./src/registries'),
  webhooks: import('./src/registries'),   // omit if no webhooks
  provision: import('./src/provision'),
  events: [/* optional app event catalog */],
})
```

| Field | Purpose |
|-------|---------|
| `handle` | App slug used in URLs, event types, and CLI commands |
| `computeLayer` | Default deployment target (`serverless` = Lambda, `dedicated` = container) |
| `tools` / `webhooks` | Dynamic imports of registry modules |
| `provision` | CRM models, pages, navigation, env vars |
| `events` | Declarative catalog for workflow triggers |

BFT imports its event catalog from JSON and enriches each entry with `workflowInputType`, `examplePayload`, and `contextFields`. Vetnostics omits `webhooks` and `events` entirely.

---

## `src/registries.ts`

Single source of truth for callable tools and inbound webhooks.

```ts
import type { ToolRegistry, WebhookRegistry } from 'skedyul'
import { myToolRegistry } from './tools/my-tool'
import { myWebhook } from './webhooks/my-webhook'

export const toolRegistry: ToolRegistry = {
  my_tool: myToolRegistry,
}

export const webhookRegistry: WebhookRegistry = {
  my_webhook: myWebhook,
}
```

Rules:

- Tool keys are **snake_case** and must match the tool's `name` field.
- Export both registries even if one is empty — `skedyul.config.ts` can import the same module for tools and webhooks.
- One file per tool under `src/tools/` keeps handlers testable in isolation.

---

## `src/server/mcp_server.ts`

Runtime entry point. Creates the HTTP/Lambda server and wires hooks.

```ts
import { server } from 'skedyul'
import { toolRegistry, webhookRegistry } from '../registries'
import installHandler from './hooks/install'
import provisionHandler from './hooks/provision'
import pkg from '../../package.json'

function getComputeLayer(): 'serverless' | 'dedicated' {
  const envLayer = process.env.SKEDYUL_COMPUTE_LAYER
  if (envLayer === 'serverless' || envLayer === 'dedicated') return envLayer
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'serverless'
  return 'dedicated'
}

const computeLayer = getComputeLayer()

const skedyulServer = server.create({
  name: 'My Integration',
  version: pkg.version,
  description: '...',
  computeLayer,
  tools: toolRegistry,
  webhooks: webhookRegistry,       // omit if none
  hooks: {
    install: installHandler,
    provision: provisionHandler,   // optional
    uninstall: uninstallHandler,   // optional
  },
})

export const handler = 'handler' in skedyulServer ? skedyulServer.handler : undefined

if (computeLayer === 'dedicated' && 'listen' in skedyulServer) {
  skedyulServer.listen(parseInt(process.env.PORT || '3000', 10))
}
```

Compute layer detection order:

1. `SKEDYUL_COMPUTE_LAYER` env var (explicit override)
2. `AWS_LAMBDA_FUNCTION_NAME` presence (Lambda)
3. Default `dedicated` for local Docker

Vetnostics passes install hook with a timeout object; BFT passes handler functions directly — both are valid.

---

## `src/provision/`

Aggregates everything provisioned with an app version: CRM schema, pages, navigation, env vars.

```ts
// src/provision/index.ts
import type { ProvisionConfig } from 'skedyul'
import env from './env'
import navigation from './pages/navigation'
import relationships from './relationships'
import myModel from './models/my-model'
import myPage from './pages/my-page'

const config: ProvisionConfig = {
  env,                    // optional
  navigation,
  relationships,          // optional
  models: [myModel],
  pages: [myPage],
}

export default config
```

Split large apps into subfolders:

| Subfolder | Contents |
|-----------|----------|
| `models/` | `defineModel()` CRM schemas |
| `pages/` | `definePage()` UI pages |
| `env.ts` | `defineEnv()` provision-scoped secrets |
| `relationships.ts` | CRM model relationships |

BFT also has `provision/events/` for Glofox-specific event helpers. Vetnostics uses `provision/crm/` as a barrel for models and relationships.

### Page audiences

| `audience` | Who sees it | Example (BFT) |
|------------|-------------|---------------|
| *(default / install)* | Workplace users after install | Request Access, Members |
| `developer` | App owner / admin console | Access Requests, Studios |

Developer pages pair with `executionScope: 'app_version'` tools — see [Developer tools](./developer-tools.md).

---

## `src/server/hooks/`

Lifecycle handlers run at install, provision (app-version deploy), and uninstall.

| Hook | When | Typical use |
|------|------|-------------|
| `install` | Workplace installs the app | Seed env vars, create default records |
| `provision` | App version is deployed | Register provision-level webhooks, send setup emails |
| `uninstall` | Workplace uninstalls | Clean up per-installation resources |

```ts
// install.ts
import type { InstallHandlerContext, InstallHandlerResult } from 'skedyul'

export default async function install(
  ctx: InstallHandlerContext,
): Promise<InstallHandlerResult> {
  ctx.log.info(`Installing for ${ctx.workplace.subdomain}`)
  return { env: {} }
}
```

BFT's `provision` hook calls `webhook.create` to register a shared Glofox CDC endpoint. BFT's `uninstall` intentionally does **not** remove the provision-level webhook.

---

## `src/tools/`

Each tool is a `ToolDefinition` exported as a registry entry:

```ts
import { z, type ToolDefinition, createSuccessResponse } from 'skedyul'

export const myToolRegistry: ToolDefinition<Input, Output> = {
  name: 'my_tool',
  label: 'My Tool',
  description: 'What it does',
  inputSchema: MyInputSchema,
  outputSchema: MyOutputSchema,
  timeout: 60000,
  handler: async (input, context) => {
    return createSuccessResponse({ /* ... */ })
  },
}
```

Tool naming conventions:

- File: `my-tool.ts` (kebab-case)
- Registry key + `name`: `my_tool` (snake_case)
- Page action `handler`: `'my_tool'` (matches registry key)

See [Tools](../tools.md) for schemas, billing, and response helpers.

---

## `package.json`

```json
{
  "name": "@skedyul/private-integration-my-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/registries.ts",
  "scripts": {
    "build": "skedyul build",
    "test": "..."
  },
  "dependencies": {
    "skedyul": "1.5.x"
  }
}
```

`main` points at registries so the SDK can resolve tool metadata during build.

---

## Minimal vs full apps

| Concern | Vetnostics (minimal) | BFT (full) |
|---------|---------------------|------------|
| Webhooks | None | `glofox_cdc` provision-level webhook |
| Events | None | 9 Glofox CDC events with catalog |
| Hooks | Install only | Install, provision, uninstall |
| Tools | 1 (`parse_lab_report`) | 8 (install + developer) |
| `executionScope` | Default (`installation`) | Mix of default + `app_version` |
| Env vars | None | Glofox API + webhook secrets |

Start with the Vetnostics shape and add BFT patterns as complexity grows:

1. [Provision-only app](./provision-only-app.md) — CRM + one tool
2. [Developer tools](./developer-tools.md) — `app_version` scope + admin pages
3. [App events](./app-events-and-workflows.md) — event catalog + `event.create`
4. [Webhooks](./webhooks-and-external-events.md) — external CDC ingestion
5. [AI + files](./ai-and-files.md) — `file.upload` + `ai.generateObject`

---

## Related docs

- [Configuration](../configuration.md) — `defineConfig`, `definePage`, `defineModel`
- [Lifecycle hooks](../lifecycle-hooks.md) — install/provision/uninstall details
- [Server runtime](../server.md) — dedicated vs serverless
- [CLI reference](../cli.md) — `skedyul build`, `skedyul dev`, deploy
