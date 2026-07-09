# Provision-only integration app

A minimal Skedyul integration: one tool, CRM models, and install-time pages — no webhooks, events, or developer admin UI. Based on **Vetnostics** (`packages/skedyul-integrations/private/integrations/vetnostics`).

Use this pattern when your app:

- Exposes a small number of tools agents or workflows call
- Needs CRM models and pages for workplace users
- Does not ingest external webhooks or emit app events
- Does not require app-owner admin tools

---

## What Vetnostics includes

| Piece | Present? | Notes |
|-------|----------|-------|
| `skedyul.config.ts` | Yes | Tools + provision only |
| `src/registries.ts` | Yes | Single tool |
| `src/server/mcp_server.ts` | Yes | Install hook only |
| `src/provision/` | Yes | CRM models, one page, navigation |
| `src/tools/` | Yes | `parse_lab_report` |
| Webhooks | No | — |
| App events | No | — |
| Developer pages | No | — |
| Provision env vars | No | No external API credentials |
| `executionScope: 'app_version'` | No | Default installation scope |

---

## `skedyul.config.ts`

```ts
import { defineConfig } from 'skedyul'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  name: 'Vetnostics',
  version: pkg.version,
  description: 'Parses lab result PDFs into structured data',
  computeLayer: 'serverless',

  tools: import('./src/registries'),
  provision: import('./src/provision'),
})
```

No `handle` is required when the app name is sufficient. Add `handle` if you need a stable slug for CLI commands or event types.

Omit `webhooks`, `events`, `agents`, and `signals` until you need them.

---

## Registry — one tool

```ts
// src/registries.ts
import type { ToolRegistry } from 'skedyul'
import { parseLabReportRegistry } from './tools/parse_lab_report'

export const toolRegistry: ToolRegistry = {
  parse_lab_report: parseLabReportRegistry,
}
```

No `webhookRegistry` export needed.

---

## MCP server — install hook only

```ts
// src/server/mcp_server.ts
import { server } from 'skedyul'
import { toolRegistry } from '../registries'
import installHandler from './hooks/install'
import pkg from '../../package.json'

const skedyulServer = server.create({
  name: 'Vetnostics',
  version: pkg.version,
  description: '...',
  computeLayer: getComputeLayer(),
  tools: toolRegistry,
  hooks: {
    install: {
      handler: installHandler,
      timeout: 30000,
    },
  },
})
```

### Minimal install handler

```ts
// src/server/hooks/install.ts
import type { InstallHandlerContext, InstallHandlerResult } from 'skedyul'

export default async function install(
  ctx: InstallHandlerContext,
): Promise<InstallHandlerResult> {
  ctx.log.info(`Installing for workplace ${ctx.workplace.subdomain}`)
  return { env: {} }
}
```

Return `{ env: { KEY: 'value' } }` only when the workplace needs per-installation secrets. Vetnostics returns an empty env because parsing uses platform AI and file APIs — no external credentials.

---

## Provision config

Modular aggregation keeps `index.ts` small as models grow.

```ts
// src/provision/index.ts
import type { ProvisionConfig } from 'skedyul'
import { models, relationships } from './crm'
import * as pages from './pages'
import navigation from './pages/navigation'

const config: ProvisionConfig = {
  navigation,
  models: Object.values(models),
  pages: Object.values(pages),
  relationships,
}

export default config
```

### CRM models

Vetnostics defines pathology models under `provision/crm/models/`:

- `test_order` — order header
- `test_report` — per-panel report
- `panel_result`, `culture_result`, `sensitivity_result` — result rows

Each model uses `defineModel()` with fields matching the tool output schema. Workflows (not the tool) write to CRM — the tool is **parse-only**.

### Single install page

```ts
// src/provision/pages/pathology/page.ts
import { definePage } from 'skedyul'

export default definePage({
  handle: 'pathology',
  label: 'Pathology',
  type: 'instance',
  path: '/pathology',
  default: true,
  navigation: true,
  blocks: [
    {
      type: 'info',
      title: 'Lab Results Sync',
      description:
        'Lab results are synced via workflow. parse_lab_report extracts data; the workflow writes CRM records.',
    },
  ],
})
```

`default: true` makes this the landing page after install. No page actions — workflows handle sync.

### Navigation

```ts
// src/provision/pages/navigation.ts
import { defineNavigation } from 'skedyul'

export default defineNavigation({
  items: [
    { label: 'Pathology', href: '/pathology', icon: 'FlaskConical' },
  ],
})
```

---

## Tool design — fetch/parse only

Provision-only apps typically separate **extraction** from **persistence**:

| Layer | Responsibility |
|-------|----------------|
| Tool | Parse, transform, return structured data |
| Workflow | CRM create/update, notifications, side effects |

Vetnostics `parse_lab_report`:

- Accepts `file_id` (from `file.upload`) or `content` (plain text/HTML)
- Returns `test_reports[]` with analyte results, culture results, metadata
- Does **not** call `instance.create` — workflows sync to CRM

```ts
export const parseLabReportRegistry: ToolDefinition<Input, Output> = {
  name: 'parse_lab_report',
  label: 'Parse Lab Report',
  description: 'Parse veterinary lab results. Returns data for workflow-based CRM sync.',
  inputSchema: ParseLabReportInputSchema,
  outputSchema: ParseLabReportOutputSchema,
  timeout: 600000,
  retries: 3,
  handler: async (input, _context) => { /* ... */ },
}
```

Long `timeout` and `retries` suit AI-heavy parsing. See [AI and files](./ai-and-files.md).

---

## Supporting `src/lib/`

Domain logic lives outside the tool handler:

```
src/lib/
├── content_parser.ts    # AI two-phase extraction
├── html_parser.ts       # Deterministic Vetnostics HTML parser
├── types.ts             # Internal result types
└── regions/             # Per-region test code configs
```

Keep handlers thin — validate input, call lib functions, map to output schema, return `createSuccessResponse` or error helpers.

---

## When to grow beyond provision-only

Add capabilities incrementally:

| Need | Add |
|------|-----|
| External system pushes data | `webhooks/` + `webhookRegistry` — [Webhooks](./webhooks-and-external-events.md) |
| Workflows trigger on domain changes | `events` in config + `event.create` — [App events](./app-events-and-workflows.md) |
| App owner admin UI | Developer pages + `executionScope: 'app_version'` — [Developer tools](./developer-tools.md) |
| Per-workplace API keys | `provision/env.ts` with `defineEnv()` |
| AI document parsing | `file.upload` + `ai.generateObject` — [AI and files](./ai-and-files.md) |

---

## Build and test

```bash
cd packages/skedyul-integrations/private/integrations/vetnostics
pnpm build          # skedyul build
pnpm test           # unit tests for parsers
```

Local dev:

```bash
skedyul dev --workplace <subdomain>
```

---

## Checklist — new provision-only app

- [ ] `skedyul.config.ts` with `tools` + `provision` imports
- [ ] `src/registries.ts` exporting `toolRegistry`
- [ ] `src/server/mcp_server.ts` with `server.create()`
- [ ] `src/server/hooks/install.ts` returning `{ env: {} }` or seeded env
- [ ] `src/provision/index.ts` aggregating models, pages, navigation
- [ ] At least one `definePage()` with `default: true`
- [ ] Tool(s) that return data; workflows handle CRM writes
- [ ] `package.json` with `"build": "skedyul build"`

---

## Related docs

- [Project structure](./project-structure.md) — full app layout
- [Configuration](../configuration.md) — `defineModel`, `definePage`, `defineNavigation`
- [Tools](../tools.md) — tool handlers and responses
- [AI and files](./ai-and-files.md) — Vetnostics parsing patterns
