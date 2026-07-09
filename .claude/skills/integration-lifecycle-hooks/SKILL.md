---
name: integration-lifecycle-hooks
description: |
  Use when implementing install, provision, or uninstall hooks: handler signatures,
  wiring in mcp_server.ts, OAuth flows, and webhook setup/cleanup.
---

# Lifecycle Hooks

## SDK docs

- `node_modules/skedyul/docs/lifecycle-hooks.md` — full hook reference
- `node_modules/skedyul/docs/errors.md` — `InstallError` types for install failures
- `node_modules/skedyul/docs/webhooks.md` — `webhook.create` in provision

## Hook overview

| Hook | When | Token | Typical use |
|------|------|-------|-------------|
| `install` | User installs app | `sk_wkp_*` | Validate credentials, per-install setup |
| `provision` | App version deployed | `sk_prv_*` | Register shared webhooks, verify API keys |
| `uninstall` | User uninstalls | `sk_wkp_*` | Revoke tokens, cleanup external resources |
| `oauth_callback` | OAuth redirect | — | Exchange code for tokens |

## Wiring

Hooks live in `src/server/hooks/` and wire in `src/server/mcp_server.ts`:

```ts
import installHandler from './hooks/install'
import provisionHandler from './hooks/provision'
import uninstallHandler from './hooks/uninstall'

const skedyulServer = server.create({
  tools: toolRegistry,
  webhooks: webhookRegistry,
  hooks: {
    install: installHandler,
    provision: provisionHandler,
    uninstall: uninstallHandler,
  },
})
```

Optional timeouts:

```ts
hooks: {
  provision: { handler: provisionHandler, timeout: 300000 },
}
```

## Install handler

```ts
import type { InstallHandlerContext, InstallHandlerResult } from 'skedyul'
import { AuthenticationError, MissingRequiredFieldError } from 'skedyul'

export default async function install(
  ctx: InstallHandlerContext,
): Promise<InstallHandlerResult> {
  ctx.log.info(`Installing for ${ctx.workplace.subdomain}`)

  if (!ctx.env.API_KEY) {
    throw new MissingRequiredFieldError('API_KEY')
  }

  // Validate credentials against external API
  try {
    await verifyApiKey(ctx.env.API_KEY)
  } catch {
    throw new AuthenticationError('Invalid API key')
  }

  return {
    env: { API_URL: ctx.env.API_URL || 'https://api.default.com' },
  }
}
```

Context: `ctx.env`, `ctx.workplace`, `ctx.appInstallationId`, `ctx.app`, `ctx.log`

## Provision handler

Version-level setup — runs once per deploy, not per installation:

```ts
import type { ProvisionHandlerContext, ProvisionHandlerResult } from 'skedyul'
import { ensureProvisionGlofoxWebhook } from '../../lib/ensure-glofox-webhooks'

export default async function provision(
  ctx: ProvisionHandlerContext,
): Promise<ProvisionHandlerResult> {
  ctx.log.info('[Provision] Ensuring webhook registration')
  const registration = await ensureProvisionGlofoxWebhook()
  ctx.log.info(`Webhook URL: ${registration.url}`)
  return {}
}
```

Use for: `webhook.create()`, health checks, shared external registrations.

## Uninstall handler

Log errors, don't throw on cleanup failures. Return `{ cleanedWebhookIds }`. Revoke external tokens and call `webhook.deleteByName()` where needed.

## OAuth (install + oauth_callback)

When `oauth_callback` exists, `install` **must** return `{ redirect }`. Callback exchanges code and returns `{ appInstallationId, env: { ACCESS_TOKEN } }`.

## Install vs provision

| | Install | Provision |
|---|---------|-----------|
| When | Per install | Per version deploy |
| Token | `sk_wkp_*` | `sk_prv_*` |
| Use | Validate creds, per-install setup | Shared webhooks, API health checks |

BFT: provision registers Glofox CDC webhook; install defers CRM writes to tools.

## Reference examples (read-only)

- **BFT** `private-integrations/integrations/bft/src/server/hooks/` — provision webhook setup, minimal install/uninstall
- **Public email** `integrations/integrations/email/` — OAuth install flow, channel setup

## Anti-patterns

- **Do not edit reference clones**
- **Do not use `workspace:*` for `skedyul`**
- **Only edit `projectDirectory`**
- **Do not throw on uninstall cleanup failures** — log and continue
- **Do not do per-install work in provision** — use install hook
- **Do not omit `redirect` when `oauth_callback` is defined**
- **Do not perform heavy CRM writes in install** if it causes build-time module issues (defer to first tool call)

## Validate

```bash
pnpm build
# Test install flow via Skedyul dev workplace (see node_modules/skedyul/docs/cli.md)
```
