# Events and triggers

Event-driven automation in Skedyul: thread events, app events, workflow triggers, and install-time signals.

For agent YAML, skills, and workflow step syntax, see [Agents, skills & workflows](./agents.md).

---

## Event categories

| Category | Source | Example | Subscription |
|----------|--------|---------|--------------|
| **Thread events** | Platform messaging | `thread.message.created` | Workflow YAML `events.subscriptions` |
| **App events** | Integration `event.create` | `member.created` (BFT) | Workflow YAML or signals |
| **Custom events** | User-defined | `custom.order.shipped` | Workflow YAML |
| **Signals** | Provision config | `new_booking` → workflow handle | Auto-subscribed on install |

---

## Thread events

Platform events from messaging, participants, context changes, and workflow lifecycle.

```ts
import {
  ThreadEventTypeSchema,
  ThreadEventSchema,
  EventsConfigSchema,
} from 'skedyul'
```

### Event types

- `thread.message.*` — created, updated, deleted
- `thread.participant.*` — joined, left
- `thread.context.changed`
- `thread.workflow.*` — started, completed, failed
- `custom.*` — workplace-defined custom events

### Workflow subscription example

```yaml
events:
  subscriptions:
    - event: thread.message.created
      conditions:
        channel: sms
```

Conditions filter on event payload fields before the workflow runs.

---

## App events (integration catalog)

Events your integration emits via `event.create`. Declared in `skedyul.config.ts`:

```ts
export default defineConfig({
  events: [
    {
      name: 'member.created',
      label: 'Member created',
      description: 'A new member joins your Glofox studio',
      group: 'Members',
      icon: 'UserPlus',
      workflowInputType: '@app/bft/member/created',
      examplePayload: { glofox_id: '...', first_name: 'Jane' },
      contextFields: [
        { path: 'data.glofox_id', label: 'Glofox ID', type: 'string' },
        { path: 'data.email', label: 'Email', type: 'string' },
      ],
    },
  ],
})
```

### Emitting

```ts
import { event } from 'skedyul'

const { emitted } = await event.create('member.created', payload, {
  app: 'bft',
  trigger: 'webhook',
  correlationId: traceId,
})
```

- `emitted: false` — no workflow subscribed (not an error)
- Payload fields are available in workflows as `data.<field>`

### CLI testing

```bash
skedyul event create member.created '{"glofox_id":"test"}' \
  --workplace <subdomain> --app bft
```

See [App events and workflows](./integration-patterns/app-events-and-workflows.md) for the full BFT catalog pattern.

---

## Triggers (workflow bindings)

Triggers map event payloads to workflow inputs using Liquid templates and conditions.

```ts
import {
  resolveInputMappings,
  evaluateTemplate,
  evaluateCondition,
  matchesTrigger,
} from 'skedyul'
```

### How bindings work

1. Event fires (thread or app)
2. Platform evaluates trigger conditions against payload
3. Matching triggers map event fields → workflow inputs via Liquid
4. Workflow starts with resolved inputs

### Template evaluation

```ts
const value = evaluateTemplate('{{ data.email }}', { data: { email: 'jane@example.com' } })
// → 'jane@example.com'
```

### Condition matching

```ts
const matches = matchesTrigger(
  { conditions: { 'data.glofox_active': true } },
  { data: { glofox_active: true, email: 'jane@example.com' } },
)
```

Use `contextFields` in the app event catalog to document available Liquid paths.

---

## Signals (install-time subscriptions)

Signals subscribe workplaces to workflows automatically when they install your app. Defined in provision config:

```ts
// src/provision/index.ts or skedyul.config.ts
signals: [
  {
    handle: 'new_booking',
    label: 'New Booking',
    workflowHandle: 'send_confirmation',
  },
]
```

| Field | Purpose |
|-------|---------|
| `handle` | Signal identifier |
| `label` | UI label in workplace settings |
| `workflowHandle` | Workflow to run when signal fires |

Signals bridge install-time defaults and runtime app events. A signal may point to a workflow that subscribes to a specific app event.

---

## Thread events vs app events

| | Thread events | App events |
|---|---------------|------------|
| **Emitted by** | Platform (messaging, CRM context) | Your integration (`event.create`) |
| **Declared in** | Platform schema | `skedyul.config.ts` `events` array |
| **Payload** | Thread/message/participant shape | Your domain shape (flat fields) |
| **Typical use** | Reply to SMS, route inbound messages | Sync external CDC, domain automation |
| **CLI test** | Limited | `skedyul event create` |

---

## Cross-installation event emission

Webhooks and provision-scoped handlers lack workplace token context. Exchange before emitting:

```ts
const { token: scopedToken } = await token.exchangeRaw(appInstallationId)

await runWithConfig({ baseUrl, apiToken: scopedToken }, async () => {
  await event.create(eventName, payload, { app: 'bft' })
})
```

See [Webhooks and external events](./integration-patterns/webhooks-and-external-events.md).

---

## Workflow YAML event subscriptions

```yaml
$schema: https://skedyul.com/schemas/workflow/v1
handle: sync_member
name: Sync Member to CRM

inputs:
  glofox_id:
    type: string
    required: true

events:
  subscriptions:
    - event: member.created
      app: bft
      inputMappings:
        glofox_id: '{{ data.glofox_id }}'
      conditions:
        data.glofox_active: true

steps:
  upsert_lead:
    service: crm
    cmd: upsert
    inputs:
      model: lead
      data: '{{ event.data }}'
```

### Subscription fields

| Field | Purpose |
|-------|---------|
| `event` | Event name |
| `app` | App handle (required for app events) |
| `conditions` | Filter — workflow runs only when all match |
| `inputMappings` | Liquid templates mapping event → workflow inputs |

Deploy workflows via CLI:

```bash
skedyul workflows deploy --file ./workflows/sync-member.yaml --workplace <subdomain>
```

---

## Agent YAML events (planned)

Agent YAML v3 accepts `events` blocks in the schema, but **runtime support is not yet implemented**. Use thread events, app events, and workflow bindings for event-driven behavior today.

---

## Debugging events

1. **Emit locally** — `skedyul event create <name> '<json>' --workplace <sub> --app <handle>`
2. **Check catalog** — event must be declared in deployed app version
3. **Check subscription** — workflow must subscribe to the event name + app
4. **Check conditions** — `emitted: true` but workflow skipped means condition mismatch
5. **Check token scope** — cross-installation emits need `token.exchangeRaw`

---

## Related docs

- [App events and workflows](./integration-patterns/app-events-and-workflows.md) — BFT catalog pattern
- [Webhooks and external events](./integration-patterns/webhooks-and-external-events.md) — inbound CDC
- [Agents, skills & workflows](./agents.md) — workflow YAML v2 syntax
- [Configuration](./configuration.md) — `events`, `signals` in config
- [Core API](./core-api.md) — `event.create`
