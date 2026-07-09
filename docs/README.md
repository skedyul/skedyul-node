# skedyul SDK documentation

Documentation for the `skedyul` npm package (source: [skedyul/skedyul-node](https://github.com/skedyul/skedyul-node)).

## Quick links

- [Main README](../README.md) — installation, quick start, package exports
- [Package exports](./package-exports.md) — subpath imports (`skedyul/scheduling`, etc.)
- [CLI reference](./cli.md) — all commands and flags
- [Configuration](./configuration.md) — `skedyul.config.ts` reference

## By topic

### Building integrations

| Doc | What it covers |
|-----|----------------|
| [Configuration](./configuration.md) | `SkedyulConfig`, provision/install, models, channels, pages, env, queues, signals |
| [Tools](./tools.md) | MCP tool handlers, schemas, execution context, billing |
| [Webhooks](./webhooks.md) | Webhook definitions, CALLBACK vs WEBHOOK, lifecycle hooks on channels |
| [Lifecycle hooks](./lifecycle-hooks.md) | Install, provision, uninstall, OAuth callback |
| [Server runtime](./server.md) | `server.create()`, HTTP endpoints, dedicated vs serverless |
| [Rate-limit queues](./rate-limit-queues.md) | `queuedFetch`, queue scopes, retry via `requeue()` |
| [Estimation and billing](./estimation-and-billing.md) | `Estimation`, `MoneyMinorRange`, tool billing helpers |

### Integration patterns (from real apps)

Practical guides based on **BFT** and **Vetnostics** in `packages/skedyul-integrations/private/integrations/`.

| Doc | What it covers |
|-----|----------------|
| [Project structure](./integration-patterns/project-structure.md) | Standard app layout: config, registries, mcp_server, provision, hooks, tools |
| [Provision-only app](./integration-patterns/provision-only-app.md) | Vetnostics-style minimal app (CRM + one tool, no webhooks/events) |
| [Developer tools](./integration-patterns/developer-tools.md) | BFT `executionScope: 'app_version'`, token exchange, instance CRUD |
| [App events and workflows](./integration-patterns/app-events-and-workflows.md) | BFT event catalog, `workflowInputType`, `event.create` |
| [Webhooks and external events](./integration-patterns/webhooks-and-external-events.md) | BFT webhook registry, Glofox CDC, `webhook.create` in provision |
| [AI and files](./integration-patterns/ai-and-files.md) | Vetnostics `file.upload` + `ai.generateObject` patterns |

### Platform API

| Doc | What it covers |
|-----|----------------|
| [Authentication](./authentication.md) | Token types (`sk_app_*`, `sk_wkp_*`, `sk_prv_*`), `configure`, `runWithConfig` |
| [Core API](./core-api.md) | `workplace`, `communicationChannel`, `instance`, `token`, `file`, `webhook`, `cron`, `event`, `ai`, `call`, `report` |
| [Errors](./errors.md) | `InstallError` hierarchy, `AppAuthInvalidError` |

### Agents & automation

| Doc | What it covers |
|-----|----------------|
| [Agents, skills & workflows](./agents.md) | Agent YAML v3, skills, workflow YAML v2, compiler, context, scheduling |
| [Events and triggers](./events-and-triggers.md) | Thread events, app events, workflow bindings, signals |
| [CRM schema](./crm-schema.md) | Workplace-level `defineSchema`, CLI `crm push/pull/diff` |

### Developer tools

| Doc | What it covers |
|-----|----------------|
| [CLI reference](./cli.md) | Auth, dev, build, deploy, agents, skills, workflows, chat, CRM, instances, events |

## Two agent models

Skedyul supports two complementary agent configurations:

1. **Provision agents** — defined in `skedyul.config.ts` via `defineAgent()` and deployed with your app version. Simple system prompt + tool bindings for multi-tenant app agents.

2. **Agent YAML v3** — workplace-deployed agents with skills, personas, scheduling, and versioning. Managed via `skedyul agents` CLI commands.

See [Agents, skills & workflows](./agents.md) for details on both.

## Suggested reading paths

### New integration (start simple)

1. [Project structure](./integration-patterns/project-structure.md) — directory layout
2. [Provision-only app](./integration-patterns/provision-only-app.md) — minimal Vetnostics pattern
3. [Configuration](./configuration.md) + [Tools](./tools.md)
4. [CLI reference](./cli.md) — local dev workflow
5. [Authentication](./authentication.md) + [Core API](./core-api.md)

### Add AI document parsing

1. [AI and files](./integration-patterns/ai-and-files.md)
2. [Estimation and billing](./estimation-and-billing.md) — if tool has variable cost

### Add external webhooks + automation

1. [Webhooks and external events](./integration-patterns/webhooks-and-external-events.md)
2. [App events and workflows](./integration-patterns/app-events-and-workflows.md)
3. [Events and triggers](./events-and-triggers.md)

### Multi-tenant admin / developer console

1. [Developer tools](./integration-patterns/developer-tools.md)
2. [Authentication](./authentication.md) — `sk_prv_*` vs `sk_wkp_*` tokens

### Agents and workflows

1. [Events and triggers](./events-and-triggers.md)
2. [Agents, skills & workflows](./agents.md)
3. [Server runtime](./server.md) — before production deploy

### Package reference

- [Package exports](./package-exports.md) — all `skedyul/*` import paths
