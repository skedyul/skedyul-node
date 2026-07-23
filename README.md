# skedyul

The official Node.js SDK for building [Skedyul](https://skedyul.com) integration apps. Publish tools, webhooks, CRM models, agents, skills, and workflows — then run them on serverless (Lambda) or dedicated (Docker/ECS) compute.

**Package:** `skedyul` · **Version:** 1.7.0-alpha.1.1 *(prerelease on PR branch)*

## What you can build

| Capability | Description |
|------------|-------------|
| **MCP tools** | Functions AI agents invoke via the Model Context Protocol |
| **Webhooks** | HTTP handlers for SMS, email, OAuth callbacks, and third-party events |
| **Lifecycle hooks** | Install, provision, uninstall, and OAuth flows |
| **CRM models** | App-owned (internal) and user-mapped (shared) data models |
| **Agents (v3)** | Skills-based autonomous agents deployed per workplace |
| **Skills & workflows** | YAML-defined capabilities and event-driven automation |
| **Core API client** | Typed client for workplaces, channels, instances, files, cron, AI, calls, and more |
| **CLI** | Local dev server, tunneling, deploy, CRM schema sync, agent testing |

## Installation

```bash
npm install skedyul
# or
pnpm add skedyul
```

The CLI is included:

```bash
skedyul --help
```

## Quick start

### 1. Create `skedyul.config.ts`

```ts
import { defineConfig } from 'skedyul'
import pkg from './package.json'

export default defineConfig({
  name: 'My Integration',
  version: pkg.version,
  description: 'What this app does',
  computeLayer: 'serverless',

  tools: import('./src/registries'),
  webhooks: import('./src/registries'),
  provision: import('./provision'),
})
```

### 2. Aggregate provision config

```ts
// provision.ts
import type { ProvisionConfig } from 'skedyul'
import env from './env'
import { models, relationships } from './crm'
import * as channels from './channels'
import * as pages from './pages'
import navigation from './pages/navigation'

export default {
  env,
  navigation,
  models: Object.values(models),
  channels: Object.values(channels),
  pages: Object.values(pages),
  relationships,
} satisfies ProvisionConfig
```

### 3. Define a tool

```ts
import { z, type ToolHandler, type ToolDefinition } from 'skedyul'

const inputSchema = z.object({
  name: z.string().optional(),
})

type Input = z.infer<typeof inputSchema>
type Output = { message: string }

const handler: ToolHandler<Input, Output> = async (input) => ({
  output: { message: `Hello, ${input.name ?? 'world'}!` },
  billing: { credits: 1 },
  meta: { success: true, message: 'Greeting sent', toolName: 'hello' },
})

export const helloTool: ToolDefinition<Input, Output> = {
  name: 'hello',
  description: 'Say hello to someone',
  inputSchema,
  handler,
}
```

### 4. Build and run locally

```bash
skedyul auth login
skedyul dev link --workplace my-clinic
skedyul build
skedyul dev serve --workplace my-clinic
```

See [Local development](./docs/cli.md#local-development) for the full workflow.

## Package exports

| Import path | Use case |
|-------------|----------|
| `skedyul` | Main SDK — config, tools, webhooks, Core API, schemas |
| `skedyul/serverless` | AWS Lambda handler entry |
| `skedyul/dedicated` | Long-running HTTP server entry |
| `skedyul/schemas/agent-schema-v3` | Agent YAML v3 types and validation |
| `skedyul/schemas/agent-schema` | Legacy multi-stage agent schema |
| `skedyul/skills/types` | Skill YAML types |
| `skedyul/scheduling` | Workflow-safe time windows and wait calculations |
| `skedyul/cli/utils/auth` | CLI auth helpers (for monorepo tooling) |

## Server modes

### Serverless (Lambda)

```ts
import { server } from 'skedyul'
import config from './skedyul.config'

const mcpServer = server.create({
  ...config,
  computeLayer: 'serverless',
  tools: toolRegistry,
  webhooks: webhookRegistry,
})

export const handler = mcpServer.handler
```

Or use the dedicated subpath export:

```ts
import { handler } from 'skedyul/serverless'
```

### Dedicated (Docker / ECS)

```ts
const mcpServer = server.create({
  ...config,
  computeLayer: 'dedicated',
  defaultPort: 3000,
  tools: toolRegistry,
  webhooks: webhookRegistry,
})

await mcpServer.listen()
```

See [Server runtime](./docs/server.md) for endpoints, hooks, and compute-layer differences.

## Documentation

Full documentation lives in [`docs/`](./docs/README.md).

### Getting started

| Guide | Description |
|-------|-------------|
| [Configuration](./docs/configuration.md) | `skedyul.config.ts` reference — models, channels, pages, env, queues |
| [Tools](./docs/tools.md) | Building MCP tools with Zod schemas and handlers |
| [Webhooks](./docs/webhooks.md) | Receiving external events and lifecycle hooks on channels |
| [Lifecycle hooks](./docs/lifecycle-hooks.md) | Install, provision, uninstall, OAuth |
| [Authentication](./docs/authentication.md) | Token types, scopes, and SDK configuration |
| [Core API](./docs/core-api.md) | Platform resource client reference |
| [Errors](./docs/errors.md) | Install and runtime error types |

### Platform features

| Guide | Description |
|-------|-------------|
| [Agents, skills & workflows](./docs/agents.md) | Agent YAML v3, skills, workflow YAML, compiler, context |
| [CRM schema](./docs/crm-schema.md) | Workplace-level schema migrations (`defineSchema`) |
| [Rate-limit queues](./docs/rate-limit-queues.md) | `queuedFetch` for external API throttling |
| [Server runtime](./docs/server.md) | HTTP endpoints, dedicated vs serverless, MCP protocol |
| [CLI reference](./docs/cli.md) | All `skedyul` commands and flags |

## Project structure

Recommended layout for a modular integration app:

```
my-app/
├── skedyul.config.ts       # App metadata, registries, build, queues
├── provision.ts            # Aggregates version-level config
├── install.ts              # Optional per-installation config (shared models)
├── env.ts                  # Environment variable definitions
├── crm/
│   ├── index.ts
│   ├── relationships.ts
│   └── models/
├── channels/
├── pages/
├── agents/                 # Agent YAML v3 files (deployed via CLI)
├── skills/                 # Skill YAML files
├── workflows/              # Workflow YAML v2 files
└── src/
    ├── registries.ts       # Tool and webhook registries
    └── server.ts           # Optional custom server entry
```

## CLI overview

```bash
# Authentication
skedyul auth login
skedyul auth use <profile>

# Local development (linked mode)
skedyul dev link --workplace <subdomain>
skedyul dev install --workplace <subdomain>
skedyul build
skedyul dev serve --workplace <subdomain>

# Deploy
skedyul dev diff --workplace <subdomain>
skedyul dev deploy --workplace <subdomain>

# Agents, skills, workflows
skedyul agents deploy --file ./agents/booking.yaml --workplace <subdomain>
skedyul skills deploy --file ./skills/scheduling.yaml --workplace <subdomain>
skedyul workflows deploy --file ./workflows/reminder.yaml --workplace <subdomain>

# Testing
skedyul chat --agent booking --workplace <subdomain>
skedyul dev invoke my_tool --workplace <subdomain>
```

See [CLI reference](./docs/cli.md) for every command, flag, and config file path.

## Configuration files

| File | Purpose |
|------|---------|
| `~/.skedyul/profiles.json` | Auth profiles (multi-server support) |
| `~/.skedyul/config.json` | Global CLI config (`defaultServer`, `ngrokAuthtoken`) |
| `.skedyul.local.json` | Project-level server URL override |
| `.skedyul/links/<workplace>.json` | Per-workplace link config |
| `.skedyul/env/<workplace>.env` | Per-workplace environment variables |

## Development (this package)

```bash
pnpm install
pnpm build    # Compile TypeScript + bundle with tsup
pnpm test     # Node test runner
```

## Contributing

1. Use strict TypeScript — no `any`
2. Keep MCP transports lean; shared logic belongs in `src/server/route-handlers`
3. Add unit tests under `tests/` for new behavior
4. Update docs in `docs/` when adding public APIs or CLI commands

Open a PR against `master`. GitHub Actions will:

- Fill or upgrade the PR description (plan-style template + classification label)
- Sync README/docs via Copilot when public SDK surface changes
- Assign a prerelease version like `1.7.0-alpha.{pr}.{sync}` and tag `v{version}` on the PR branch
- Publish that prerelease to npm (`alpha` dist-tag). Pin it in an integration app while the feature is in development: `"skedyul": "1.7.0-alpha.42.1"`

After merge, dispatch **Publish to NPM** from GitHub Actions when ready for a stable **`latest`** release. Copilot chooses patch vs minor (never major); other apps pin the new stable exact version.

See [docs/README.md](./docs/README.md) for documentation structure.

## License

MIT
