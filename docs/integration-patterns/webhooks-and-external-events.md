# Webhooks and external events

Receive inbound HTTP callbacks from external systems, validate them, and emit app events. Based on **BFT** Glofox CDC (`packages/skedyul-integrations/private/integrations/bft`).

---

## Two webhook layers

| Layer | Registration | Scope | BFT example |
|-------|--------------|-------|-------------|
| **Provision webhook** | `webhook.create` in provision hook | One URL per app version, shared across all installations | `glofox_cdc` |
| **Webhook handler** | `webhookRegistry` in `registries.ts` | HTTP handler code that processes inbound requests | `glofoxCdcHandler` |

Provision webhooks get a stable platform URL. Handlers define how to parse and respond to incoming requests.

---

## Webhook registry

```ts
// src/registries.ts
import type { WebhookRegistry } from 'skedyul'
import { glofoxCdcWebhook } from './webhooks/glofox-cdc'

export const webhookRegistry: WebhookRegistry = {
  glofox_cdc: glofoxCdcWebhook,
}
```

Wire in config and server:

```ts
// skedyul.config.ts
webhooks: import('./src/registries'),

// src/server/mcp_server.ts
server.create({
  webhooks: webhookRegistry,
  hooks: { provision: provisionHandler },
})
```

Webhook key (`glofox_cdc`) must match the name passed to `webhook.create`.

---

## Webhook definition

```ts
// src/webhooks/glofox-cdc.ts
import type { WebhookDefinition, WebhookHandler, WebhookResponse } from 'skedyul'

const glofoxCdcHandler: WebhookHandler = async (request, context): Promise<WebhookResponse> => {
  // validate → transform → emit event → return 200
}

export const glofoxCdcWebhook: WebhookDefinition = {
  name: 'glofox_cdc',
  description: 'Receive all Glofox CDC events (member, membership, booking).',
  methods: ['POST'],
  type: 'WEBHOOK',
  handler: glofoxCdcHandler,
}
```

| Field | Value | Notes |
|-------|-------|-------|
| `type` | `'WEBHOOK'` | Inbound HTTP endpoint (vs `'CALLBACK'` for OAuth redirects) |
| `methods` | `['POST']` | Allowed HTTP methods |
| `handler` | Async function | Receives raw request + context with `env` |

---

## Glofox CDC handler flow

```
POST /webhooks/glofox_cdc
  │
  ├─ 1. Check GLOFOX_WEBHOOK_SECRET in context.env
  ├─ 2. Verify HMAC signature (raw body + Signature header)
  ├─ 3. Parse JSON body → normalize event type + branch ID
  ├─ 4. Filter: ignore unknown event types (return 200 + status: ignored)
  ├─ 5. Map Glofox type → app event name (MEMBER_CREATED → member.created)
  ├─ 6. resolveActiveStudioForBranch(locationId)
  │     └─ no active studio → 200 ignored (branch_not_enabled)
  ├─ 7. transformGlofoxCdcEvent → flat BFT payload
  ├─ 8. parseBftEventPayload (Zod validation)
  ├─ 9. emitGlofoxEvent(appInstallationId, eventName, payload, traceId)
  └─ 10. Return 200 { status: 'ok', emitted, trace_id, ... }
```

### Signature verification

```ts
const rawBody = getRawBodyString(request)
const signature = getHeaderValue(request.headers, 'signature')

if (!verifyGlofoxWebhookSignature(rawBody, signature, secret)) {
  return { status: 401, body: { error: 'Invalid webhook signature' } }
}
```

Always verify against the **raw body** — re-serialized JSON breaks HMAC checks.

### Graceful ignores

Return `200` (not `4xx`) for events you cannot process — external systems retry on errors:

| Reason | Response body |
|--------|---------------|
| Unknown event type | `{ status: 'ignored', event_type }` |
| Missing branch ID | `{ status: 'ignored', reason: 'missing_location_id' }` |
| Branch not enabled | `{ status: 'ignored', reason: 'branch_not_enabled' }` |

Reserve `500` for genuine failures (emit threw, DB down).

### Event type mapping

```ts
// Glofox MEMBER_CREATED → member.created
const eventName = glofoxEventTypeToEventName(event.eventType)
const transformed = transformGlofoxCdcEvent(event)
const validatedPayload = parseBftEventPayload(eventName, transformed)
```

---

## Provision hook: `webhook.create`

Register the shared endpoint when the app version deploys:

```ts
// src/server/hooks/provision.ts
import { ensureProvisionGlofoxWebhook, buildInitialGlofoxSetupEmailBody } from '../../lib/ensure-glofox-webhooks'

export default async function provision(ctx: ProvisionHandlerContext) {
  const registration = await ensureProvisionGlofoxWebhook()
  ctx.log.info(`Glofox CDC webhook URL: ${registration.url}`)
  ctx.log.info(buildInitialGlofoxSetupEmailBody(registration.url))
  return {}
}
```

```ts
// src/lib/ensure-glofox-webhooks.ts
import { webhook } from 'skedyul'

export const GLOFOX_CDC_WEBHOOK_NAME = 'glofox_cdc' as const

export async function ensureProvisionGlofoxWebhook() {
  const { webhooks } = await webhook.list({ name: GLOFOX_CDC_WEBHOOK_NAME })
  const existing = webhooks[0]

  if (existing) {
    return { id: existing.id, url: existing.url }
  }

  const created = await webhook.create(GLOFOX_CDC_WEBHOOK_NAME)
  return { id: created.id, url: created.url }
}
```

**Idempotent** — `webhook.list` first, create only if missing. Re-deploys reuse the same URL.

### Setup email for external provider

```ts
export function buildInitialGlofoxSetupEmailBody(url: string): string {
  return [
    'Webhook event domains and their callback URLs:',
    `  MEMBERS: ${url}`,
    `  MEMBERSHIPS: ${url}`,
    `  BOOKINGS: ${url}`,
    '',
    'Requested events: MEMBER_*, MEMBERSHIP_*, BOOKING_*',
  ].join('\n')
}
```

Per-studio branch enablement uses the same URL:

```ts
export function buildBranchEnablementEmailBody(studioName, branchId, url) {
  return [
    `Business / Studio name: ${studioName}`,
    `Branch ID: ${branchId}`,
    '',
    'Please attach the above branch to our existing webhook endpoint:',
    `  MEMBERS / MEMBERSHIPS / BOOKINGS: ${url}`,
  ].join('\n')
}
```

`approve_access` generates the branch email; `activate_studio` marks the studio active once Glofox confirms.

---

## Provision env for webhook secrets

```ts
// src/provision/env.ts
export default defineEnv({
  GLOFOX_WEBHOOK_SECRET: {
    label: 'Glofox Webhook Secret',
    scope: 'provision',
    required: true,
    visibility: 'encrypted',
    description: 'Secret for verifying Glofox CDC webhook signatures',
  },
})
```

`scope: 'provision'` — one secret per app version, shared by the provision webhook handler via `context.env`.

---

## Emitting events from webhooks

Webhooks run without workplace token context. Resolve the target installation from domain data:

```ts
const studio = await resolveActiveStudioForBranch(event.locationId)
if (!studio) {
  return { status: 200, body: { status: 'ignored', reason: 'branch_not_enabled' } }
}

const { emitted } = await emitGlofoxEvent(
  studio.appInstallationId,
  eventName,
  validatedPayload,
  event.traceId,
)
```

See [App events and workflows](./app-events-and-workflows.md) for `event.create` details.

---

## Uninstall behavior

BFT intentionally does **not** remove the provision webhook on per-installation uninstall:

```ts
// src/server/hooks/uninstall.ts
export default async function uninstall(ctx) {
  return { cleanedWebhookIds: [] }
}
```

Provision webhooks are app-version resources. Remove them explicitly on deprovision:

```ts
export async function removeProvisionGlofoxWebhook(): Promise<number> {
  const { count } = await webhook.deleteByName(GLOFOX_CDC_WEBHOOK_NAME)
  return count
}
```

---

## Webhook helpers

Keep request parsing in `src/webhooks/lib/helpers.ts`:

```ts
export function getRawBodyString(request): string { /* ... */ }
export function getHeaderValue(headers, name): string | undefined { /* ... */ }
export function parseJsonBody(request): unknown | null { /* ... */ }
```

---

## Single endpoint, multiple domains

BFT uses **one** `glofox_cdc` URL for MEMBERS, MEMBERSHIPS, and BOOKINGS CDC streams. Benefits:

- One `webhook.create` call in provision
- One handler with shared signature verification
- Per-branch filtering inside the handler (`resolveActiveStudioForBranch`)
- Simpler Glofox setup — register the same URL for all domains

---

## Checklist — new external webhook

- [ ] `WebhookDefinition` in `src/webhooks/` with `type: 'WEBHOOK'`
- [ ] Export in `webhookRegistry`
- [ ] `webhooks: import('./src/registries')` in `skedyul.config.ts`
- [ ] Provision env vars for secrets (`scope: 'provision'`)
- [ ] `webhook.create(name)` in provision hook (idempotent)
- [ ] Handler: verify signature → parse → filter → emit event
- [ ] Return `200` for ignored events; `401` for bad signatures; `500` for real failures
- [ ] App events declared in config catalog (if emitting events)
- [ ] Tests for signature verification and payload transforms

---

## Related docs

- [App events and workflows](./app-events-and-workflows.md) — catalog, `event.create`
- [Webhooks](../webhooks.md) — SDK webhook types, CALLBACK vs WEBHOOK
- [Lifecycle hooks](../lifecycle-hooks.md) — provision hook
- [Core API](../core-api.md) — `webhook.create`, `webhook.list`, `webhook.deleteByName`
