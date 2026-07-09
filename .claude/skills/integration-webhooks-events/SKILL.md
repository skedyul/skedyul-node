---
name: integration-webhooks-events
description: |
  Use when adding webhooks or app events: WebhookRegistry, webhook.create, event.create,
  events catalog in skedyul.config.ts, and webhook handler patterns.
---

# Webhooks & App Events

## SDK docs

- `node_modules/skedyul/docs/webhooks.md` — definitions, CALLBACK vs WEBHOOK, lifecycle hooks
- `node_modules/skedyul/docs/configuration.md` — `events` catalog in config
- `node_modules/skedyul/docs/core-api.md` — `webhook.*`, `event.create`

## WebhookRegistry

Register in `src/registries.ts` alongside tools:

```ts
import type { WebhookRegistry } from 'skedyul'
import { glofoxCdcWebhook } from './webhooks/glofox-cdc'

export const webhookRegistry: WebhookRegistry = {
  glofox_cdc: glofoxCdcWebhook,
}
```

## WebhookDefinition

```ts
import type { WebhookDefinition, WebhookHandler } from 'skedyul'

const handler: WebhookHandler = async (request, context) => {
  const secret = context.env.GLOFOX_WEBHOOK_SECRET
  // Verify signature, parse body, process...
  return { status: 200, body: { status: 'accepted' } }
}

export const glofoxCdcWebhook: WebhookDefinition = {
  name: 'glofox_cdc',           // snake_case; matches registry key
  description: 'Glofox CDC change events',
  methods: ['POST'],
  type: 'WEBHOOK',              // fire-and-forget (default)
  // type: 'CALLBACK',          // caller waits for response (TwiML, etc.)
  handler,
}
```

### WEBHOOK vs CALLBACK

| Type | Caller behavior | Use when |
|------|-----------------|----------|
| `WEBHOOK` | Gets 200 immediately; async processing | CDC, notifications |
| `CALLBACK` | Waits for handler response body | TwiML, OAuth redirects |

## webhook.create()

Register unique URLs with external services (install/provision hooks):

```ts
import { webhook } from 'skedyul'

const { url, id } = await webhook.create('glofox_cdc', {
  purpose: 'provision',
})

// Point external API at url
await externalApi.registerWebhook(url)
```

- Handler `name` in `webhook.create()` must match registry key
- Use `webhook.list()`, `webhook.delete()`, `webhook.deleteByName()` for cleanup
- BFT provision hook calls `ensureProvisionGlofoxWebhook()` on deploy

## Runtime context

```ts
import { isRuntimeWebhookContext } from 'skedyul'

if (isRuntimeWebhookContext(context)) {
  // context.workplace, context.appInstallationId, context.registration
}
```

Provision-level webhooks lack installation context — resolve studio/install via `instance.list()`.

## App events catalog

Declare in `skedyul.config.ts` so events appear in workflow UI:

```ts
events: [
  {
    name: 'member.created',
    label: 'Member Created',
    description: 'New member synced from Glofox',
    group: 'Members',
  },
]
```

BFT enriches from JSON (`src/events/catalog.json`) with `examplePayload`, `contextFields`, `workflowInputType`.

## event.create()

Emit from tools or webhooks (after validating payload):

```ts
import { event } from 'skedyul'

await event.create('member.created', {
  member: { first_name: 'Jane', email: 'jane@example.com' },
}, {
  trigger: 'webhook',
  correlationId: traceId,
})
```

- Event `name` must be declared in config `events` array
- For cross-installation emit (provision webhook → workplace), use `token.exchange` + `runWithConfig` (BFT `emitGlofoxEvent`)
- CLI test: `skedyul event create member.created '{"member":{...}}' --workplace <sub>`

## Webhook security

- Verify provider signatures in handler (BFT: `verifyGlofoxWebhookSignature`)
- Use `request.rawBody` for HMAC verification
- Return 401/403 on invalid signatures; 200 on ignored event types

## Reference examples (read-only)
- **BFT** `private-integrations/integrations/bft/src/webhooks/glofox-cdc.ts` — signature verify, event emit
- **BFT** `private-integrations/integrations/bft/src/events/` — catalog JSON + schemas
- **Public email** `integrations/integrations/email/` — channel lifecycle webhooks

## Anti-patterns

- **Do not edit reference clones**
- **Do not use `workspace:*` for `skedyul`**
- **Only edit `projectDirectory`**
- **Do not emit undeclared events** — add to `events` in config first
- **Do not mismatch `webhook.create('foo')` and registry key**
- **Do not use CALLBACK when fire-and-forget suffices** — blocks external caller
- **Do not skip signature verification** for signed providers

## Validate

```bash
pnpm exec skedyul dev validate && pnpm build
```
