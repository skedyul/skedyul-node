# App events and workflows

Declare, validate, and emit **app events** that trigger workplace workflows. Based on **BFT** Glofox CDC events (`packages/skedyul-integrations/private/integrations/bft`).

App events differ from **thread events** (`thread.message.created`, etc.) — they represent domain changes your integration emits (member created, booking cancelled, lab result parsed).

---

## End-to-end flow (BFT)

```
Glofox CDC webhook
    → glofox_cdc handler (validate, transform)
    → resolveActiveStudioForBranch(branchId)
    → token.exchangeRaw(appInstallationId)
    → event.create('member.created', payload)
    → workplace workflow trigger (if subscribed)
```

---

## Event catalog in `skedyul.config.ts`

Declare events so the platform knows names, labels, workflow input types, and UI metadata.

```ts
import catalogMeta from './src/events/catalog.json' with { type: 'json' }
import catalogExamples from './src/events/catalog-examples.json' with { type: 'json' }
import catalogContextFields from './src/events/catalog-context-fields.json' with { type: 'json' }

const events = catalogMeta.map((entry) => {
  const examplePayload = catalogExamples[entry.name]
  const contextFields = catalogContextFields[entry.name]

  return {
    ...entry,
    workflowInputType: `@app/bft/${entry.name.replace(/\./g, '/')}`,
    ...(examplePayload ? { examplePayload } : {}),
    ...(contextFields ? { contextFields } : {}),
  }
})

export default defineConfig({
  handle: 'bft',
  // ...
  events,
})
```

### Catalog entry fields

| Field | Purpose |
|-------|---------|
| `name` | Event identifier (`member.created`) — used in `event.create` and workflow subscriptions |
| `label` | Human-readable name in UI |
| `description` | What triggers this event |
| `group` | UI grouping (Members, Bookings, Memberships) |
| `icon` | Lucide icon name |
| `workflowInputType` | Typed workflow input path (`@app/bft/member/created`) |
| `examplePayload` | Sample payload for workflow builder and CLI |
| `contextFields` | Liquid template paths for workflow conditions |

BFT defines 9 events across three groups:

| Group | Events |
|-------|--------|
| Members | `member.created`, `member.updated`, `member.deleted` |
| Bookings | `booking.created`, `booking.updated`, `booking.deleted` |
| Memberships | `membership.created`, `membership.updated`, `membership.deleted` |

---

## `workflowInputType`

Maps each event to a typed workflow input schema:

```ts
workflowInputType: `@app/bft/${entry.name.replace(/\./g, '/')}`
// member.created → @app/bft/member/created
// booking.updated → @app/bft/booking/updated
```

Workflows reference this type in step inputs and get autocomplete/validation in the builder.

---

## `examplePayload`

Flat domain fields at the root — no wrapper objects:

```ts
// src/events/examples.ts
export const BFT_EVENT_CATALOG_EXAMPLES = {
  'member.created': {
    glofox_id: 'gf_member_example',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    phone: '+15551234567',
    glofox_active: true,
    branch_id: 'branch_example',
    // ...
  },
  'booking.created': {
    glofox_id: 'bk_example',
    glofox_user_id: 'gf_member_example',
    class_name: 'Morning HIIT',
    status: 'BOOKED',
    start_time: '2026-01-02T06:00:00.000Z',
    end_time: '2026-01-02T07:00:00.000Z',
  },
  // ...
}
```

Store as JSON for config import (`catalog-examples.json`) or TypeScript for type safety (`examples.ts`). BFT uses both — TS for tests, JSON for `skedyul.config.ts`.

---

## `contextFields`

Liquid paths exposed to workflow conditions and templates:

```ts
// src/events/context-fields.ts
const BFT_MEMBER_FIELDS = [
  { path: 'data.glofox_id', label: 'Glofox ID', type: 'string' },
  { path: 'data.first_name', label: 'First name', type: 'string' },
  { path: 'data.email', label: 'Email', type: 'string' },
  // ...
]

export const BFT_EVENT_CONTEXT_FIELDS = {
  'member.created': BFT_MEMBER_FIELDS,
  'member.updated': BFT_MEMBER_FIELDS,
  // booking.* and membership.* have their own field trees
}
```

Workflows access payload fields as `data.<field>` — the platform wraps the emit payload under `data`.

---

## Typed payloads and validation

### TypeScript types

```ts
// src/events/types.ts
export interface BftMember {
  glofox_id: string
  first_name: string | null
  email: string | null
  // ...
}

export type BftEventName = keyof BftEventCatalogPayloadMap
export type BftEventEmitPayload<T extends BftEventName> = BftEventCatalogPayloadMap[T]
```

### Zod schemas

Validate before every emit:

```ts
// src/events/schemas.ts
export const BftMemberSchema = z.object({
  glofox_id: z.string().min(1),
  first_name: nullableString.optional(),
  // ...
}).strict()

export function parseBftEventPayload<T extends BftEventName>(
  eventName: T,
  payload: unknown,
): BftEventEmitPayload<T> {
  const schema = SCHEMA_BY_EVENT[eventName]
  return schema.parse(payload) as BftEventEmitPayload<T>
}
```

---

## Emitting events

### Helper wrapper

```ts
// src/lib/create-bft-event.ts
import { event } from 'skedyul'
import { parseBftEventPayload } from '../events/schemas'

export async function createBftEvent<T extends BftEventName>(
  eventName: T,
  payload: BftEventEmitPayload<T>,
  options: { correlationId?: string; trigger?: string } = {},
): Promise<{ emitted: boolean }> {
  const validated = parseBftEventPayload(eventName, payload)

  return event.create(eventName, validated, {
    app: 'bft',
    trigger: options.trigger ?? 'webhook',
    correlationId: options.correlationId,
  })
}
```

### Cross-installation emit (webhook context)

Webhooks arrive without workplace context. Exchange token first:

```ts
// src/lib/emit-glofox-event.ts
export async function emitGlofoxEvent<T extends BftEventName>(
  appInstallationId: string,
  eventName: T,
  payload: BftEventEmitPayload<T>,
  traceId: string,
): Promise<{ emitted: boolean }> {
  const { token: scopedToken } = await token.exchangeRaw(appInstallationId)
  const { baseUrl } = getConfig()

  return runWithConfig({ baseUrl, apiToken: scopedToken }, async () => {
    return createBftEvent(eventName, payload, { correlationId: traceId })
  })
}
```

### `event.create` options

| Option | Purpose |
|--------|---------|
| `app` | App handle — scopes event to catalog |
| `trigger` | Source label (`webhook`, `tool`, `cron`) |
| `correlationId` | Trace ID for logging and deduplication |

Return value `{ emitted: boolean }` — `false` when no workflow is subscribed (passthrough, not an error).

---

## Workflow bindings

Workplaces subscribe to app events via workflow YAML or signals.

### Workflow YAML subscription

```yaml
events:
  subscriptions:
    - event: member.created
      app: bft
      conditions:
        data.glofox_active: true
```

### Install-time signals (provision)

```ts
// provision config
signals: [
  {
    handle: 'new_member',
    label: 'New Member',
    workflowHandle: 'sync_member_to_crm',
  },
]
```

Signals wire default workflows on install. App events are the runtime trigger.

### CLI testing

```bash
skedyul event create member.created '{"glofox_id":"test","first_name":"Jane"}' \
  --workplace <subdomain> --app bft
```

Use `examplePayload` from the catalog as a starting point.

---

## Payload shape conventions

BFT uses **flat domain fields** at the root:

```json
{
  "glofox_id": "abc",
  "first_name": "Jane",
  "email": "jane@example.com"
}
```

Not:

```json
{
  "member": { "glofox_id": "abc", ... }
}
```

Keep catalog examples, Zod schemas, emit payloads, and `contextFields` aligned on the same shape. Mismatches break workflow conditions (`data.first_name` vs `data.member.first_name`).

---

## File organization

```
src/events/
├── catalog.json              # name, label, description, group, icon
├── catalog-examples.json     # examplePayload per event (optional JSON import)
├── catalog-context-fields.json
├── catalog.ts                # Runtime catalog builder (tests, tooling)
├── types.ts                  # TypeScript payload types
├── schemas.ts                # Zod validation + isBftEventName()
├── examples.ts               # Typed example payloads
├── context-fields.ts         # contextFields trees
└── index.ts                  # Re-exports
```

---

## Adding a new event

1. Add entry to `catalog.json` (name, label, group, icon)
2. Define TypeScript type in `types.ts`
3. Add Zod schema in `schemas.ts`
4. Add `examplePayload` in `examples.ts` / JSON
5. Add `contextFields` in `context-fields.ts`
6. Map external event type → name (if from webhook)
7. Deploy app version — catalog syncs to platform
8. Create or update workflow subscription

---

## Related docs

- [Webhooks and external events](./webhooks-and-external-events.md) — Glofox CDC ingestion
- [Events and triggers](../events-and-triggers.md) — thread events vs app events vs signals
- [Core API](../core-api.md) — `event.create`
- [Configuration](../configuration.md) — `events` in `defineConfig`
