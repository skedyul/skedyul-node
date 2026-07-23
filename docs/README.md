# skedyul SDK documentation

Documentation for the `skedyul` npm package (source: [skedyul/skedyul-node](https://github.com/skedyul/skedyul-node)).

## Release process

1. **PR** — automation updates PR template, docs, prerelease `package.json`, publishes to npm (`alpha` tag), and git tag `v{prerelease}` (e.g. `1.7.0-alpha.42.1`).
2. **Integrate** — apps under development pin the exact prerelease: `"skedyul": "1.7.0-alpha.42.1"`.
3. **Merge to `master`** — prerelease version and docs land on default branch.
4. **Publish to NPM** (manual workflow) — Copilot picks patch or minor from diff since last stable tag; publishes stable `skedyul@X.Y.Z` on **`latest`**.

Scripts: `scripts/changelog/` (PR template), `scripts/release/` (semver, prerelease, promote).

## Quick links

- [Main README](../README.md) — installation, quick start, package exports
- [CLI reference](./cli.md) — all commands and flags
- [Configuration](./configuration.md) — `skedyul.config.ts` reference

## By topic

### Building integrations

| Doc | What it covers |
|-----|----------------|
| [Configuration](./configuration.md) | `SkedyulConfig`, provision/install, models, channels, pages, env, queues, sequencers, signals |
| [Tools](./tools.md) | MCP tool handlers, schemas, execution context, billing |
| [Webhooks](./webhooks.md) | Webhook definitions, CALLBACK vs WEBHOOK, lifecycle hooks on channels |
| [Lifecycle hooks](./lifecycle-hooks.md) | Install, provision, uninstall, OAuth callback |
| [Server runtime](./server.md) | `server.create()`, HTTP endpoints, dedicated vs serverless |
| [Rate-limit queues](./rate-limit-queues.md) | `queuedFetch`, queue scopes, retry via `requeue()` |
| [Sequencer](./sequencer.md) | `sequencer.allow/acquire/release`, stale-event dropping, short-lived locks |

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

## Suggested reading order

1. [Configuration](./configuration.md) + [Tools](./tools.md)
2. [CLI reference](./cli.md) — local dev workflow
3. [Authentication](./authentication.md) + [Core API](./core-api.md)
4. [Agents, skills & workflows](./agents.md) — when building AI features
5. [Server runtime](./server.md) — before production deploy
