# Configuration

The `skedyul.config.ts` file defines your app's structure, including tools, webhooks, models, channels, and environment variables. This configuration is used during deployment to provision resources in the Skedyul platform.

## Basic Structure

```ts
// skedyul.config.ts
import { defineConfig } from 'skedyul'
import pkg from './package.json'

export default defineConfig({
  name: 'My Integration',
  version: pkg.version,
  description: 'Description of what this app does',
  computeLayer: 'serverless',

  // Tool and webhook registries
  tools: import('./src/registries'),
  webhooks: import('./src/registries'),

  // Provision configuration (aggregates all modular configs)
  provision: import('./provision'),
})
```

---

## SkedyulConfig

The top-level configuration interface:

```ts
interface SkedyulConfig {
  // Identity
  name: string
  version?: string
  description?: string

  // Runtime
  computeLayer?: 'dedicated' | 'serverless'
  defaultPort?: number
  maxRequests?: number | null
  ttlExtendSeconds?: number
  cors?: CorsOptions
  coreApi?: CoreApiConfig

  // Registries (object or dynamic import)
  tools?: ToolRegistry | Promise<{ toolRegistry: ToolRegistry }>
  webhooks?: WebhookRegistry | Promise<{ webhookRegistry: WebhookRegistry }>

  // Lifecycle hooks
  hooks?: ServerHooks

  // Declarative config
  provision?: ProvisionConfig | Promise<{ default: ProvisionConfig }>
  install?: InstallConfig | Promise<{ default: InstallConfig }>
  agents?: AgentDefinition[]
  events?: AppEventDefinition[]

  // Build & rate limits
  build?: { external?: string[] }
  queues?: QueueRegistry
  sequencers?: SequencerRegistry
}
```

### Compute Layers

| Layer | Description | Use Case |
|-------|-------------|----------|
| `dedicated` | Long-running HTTP server (Docker/ECS) | High-traffic apps, persistent connections |
| `serverless` | AWS Lambda handler | Low-traffic apps, cost optimization |

---

## Project Structure

The recommended project structure uses modular, file-based configuration:

```
my-app/
├── skedyul.config.ts          # App metadata + imports
├── provision.ts               # Aggregates all modular configs
├── env.ts                     # Environment variables
├── crm/
│   ├── index.ts               # Re-exports models + relationships
│   ├── relationships.ts       # Model relationships
│   └── models/
│       ├── index.ts
│       └── my-model.ts
├── channels/
│   ├── index.ts
│   └── my-channel.ts
├── pages/
│   ├── index.ts
│   ├── navigation.ts          # Root navigation
│   └── settings/
│       └── page.ts
└── src/
    └── registries.ts          # Tools and webhooks
```

---

## Install config

Per-installation configuration — collected when a user installs your app:

```ts
// install.ts
import type { InstallConfig } from 'skedyul'
import installEnv from './install-env'
import { sharedModels, sharedRelationships } from './crm/shared'

export default {
  env: installEnv,
  models: Object.values(sharedModels),      // SHARED scope models
  relationships: sharedRelationships,
} satisfies InstallConfig
```

| Field | Description |
|-------|-------------|
| `env` | Per-install env vars (`scope: 'install'`) |
| `models` | SHARED models mapped to user's existing data |
| `relationships` | Relationships between SHARED models |

Reference from config:

```ts
export default defineConfig({
  // ...
  install: import('./install'),
})
```

---

## Provision Config

Aggregates all modular config files for the app:

```ts
// provision.ts
import type { ProvisionConfig } from 'skedyul'

import env from './env'
import { models, relationships } from './crm'
import * as channels from './channels'
import * as pages from './pages'
import navigation from './pages/navigation'

const config: ProvisionConfig = {
  env,
  navigation,
  models: Object.values(models),
  channels: Object.values(channels),
  pages: Object.values(pages),
  relationships,
  signals,   // Optional: install-time event subscriptions
}

export default config
```

### Signals

Signals subscribe workplaces to workflows when the app is installed:

```ts
signals: [
  {
    handle: 'booking_confirmed',
    label: 'Booking Confirmed',
    workflowHandle: 'send_confirmation',
  },
]
```

---

## App events catalog

Declare events your app emits via `event.create` (for UI documentation and CLI testing):

```ts
export default defineConfig({
  // ...
  events: [
    {
      name: 'customer.sync',
      description: 'Customer records synced from external system',
    },
    {
      name: 'order.created',
      description: 'New order placed',
    },
  ],
})
```

Emit from tools:

```ts
import { event } from 'skedyul'

await event.create('customer.sync', { customers: [...] })
```

Test via CLI: `skedyul event create customer.sync '{}' --workplace <subdomain>`

---

## Lifecycle hooks

Define hooks inline in config (used by `server.create()`):

```ts
export default defineConfig({
  // ...
  hooks: {
    install: installHandler,
    provision: provisionHandler,
    uninstall: uninstallHandler,
    oauth_callback: oauthCallbackHandler,
  },
})
```

See [Lifecycle hooks](./lifecycle-hooks.md).

---

## Build configuration

Control how `skedyul build` bundles your integration:

```ts
export default defineConfig({
  // ...
  build: {
    external: ['twilio', 'stripe'],  // Exclude from bundle
  },
})
```

---

## Rate-limit queues

Define queues for `queuedFetch` — see [Rate-limit queues](./rate-limit-queues.md):

```ts
export default defineConfig({
  // ...
  queues: {
    stripeApi: {
      scope: 'provision',
      maxConcurrent: 5,
      minTime: 100,
      maxRetries: 3,
    },
  },
})
```

---

## Sequencers

Optional timestamp-aware ordering and short-lived locks — see [Sequencer](./sequencer.md):

```ts
export default defineConfig({
  // ...
  sequencers: {
    glofoxMember: {
      scope: 'install',
      enabled: true,
      lockTtlMs: 60_000,
    },
  },
})
```

---

## Environment Variables

Define environment variables using `defineEnv`:

```ts
// env.ts
import { defineEnv } from 'skedyul'

export default defineEnv({
  EXTERNAL_API_KEY: {
    label: 'API Key',
    scope: 'provision',      // 'provision' or 'install'
    required: true,
    visibility: 'encrypted', // 'visible' or 'encrypted'
    description: 'Your API key from the external service',
    placeholder: 'sk_live_xxxxx',
  },
  BASE_URL: {
    label: 'API Base URL',
    scope: 'provision',
    required: false,
    visibility: 'visible',
    placeholder: 'https://api.example.com',
  },
})
```

### Environment Variable Definition

```ts
interface EnvVariableDefinition {
  label: string                   // Display label
  scope: 'provision' | 'install'  // When collected
  required?: boolean              // Is this required?
  visibility: 'visible' | 'encrypted'
  placeholder?: string            // Input placeholder
  description?: string            // Help text
}
```

### Scopes

| Scope | When Collected | Use Case |
|-------|----------------|----------|
| `provision` | App version deployment | Shared API keys, service configs |
| `install` | User installation | Per-user credentials, workspace IDs |

### Visibility Options

| Visibility | Behavior |
|------------|----------|
| `visible` | Shown in plain text, stored unencrypted |
| `encrypted` | Hidden during input, stored encrypted |

---

## Models

Define models using `defineModel` in separate files:

```ts
// crm/models/compliance-record.ts
import { defineModel } from 'skedyul'

export default defineModel({
  handle: 'compliance_record',
  label: 'Compliance Record',
  labelPlural: 'Compliance Records',
  labelTemplate: '{{ status }} - {{ created_at }}',
  description: 'Tracks compliance status',
  scope: 'internal',           // 'internal' or 'shared'

  fields: [
    {
      handle: 'status',
      label: 'Status',
      type: 'string',
      required: true,
      owner: 'app',
      definition: {
        limitChoices: 1,
        options: [
          { label: 'Pending', value: 'pending', color: 'yellow' },
          { label: 'Approved', value: 'approved', color: 'green' },
          { label: 'Rejected', value: 'rejected', color: 'red' },
        ],
      },
    },
    {
      handle: 'document_url',
      label: 'Document URL',
      type: 'string',
      required: false,
      owner: 'app',
    },
    {
      handle: 'reviewed_at',
      label: 'Reviewed At',
      type: 'date_time',
      required: false,
      owner: 'app',
    },
  ],
})
```

### Model Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `internal` | Only accessible by your app | App-specific data (logs, settings) |
| `shared` | Linked to user's existing models | Contacts, appointments |

### Field Types

| Type | Description |
|------|-------------|
| `string` | Short text |
| `long_string` | Long text / textarea |
| `number` | Numeric value |
| `boolean` | True/false |
| `date` | Date only |
| `date_time` | Date and time |

### Field Owner

| Owner | Description |
|-------|-------------|
| `app` | App controls this field |
| `workplace` | User provides this data |

### Models Index

```ts
// crm/models/index.ts
export { default as complianceRecord } from './compliance-record'
export { default as phoneNumber } from './phone-number'
```

---

## Relationships

Define relationships between models:

```ts
// crm/relationships.ts
import type { RelationshipDefinition } from 'skedyul'

const relationships: RelationshipDefinition[] = [
  {
    source: {
      model: 'phone_number',
      field: 'compliance_record',
      label: 'Compliance Record',
      cardinality: 'many_to_one',
      onDelete: 'restrict',
    },
    target: {
      model: 'compliance_record',
      field: 'phone_numbers',
      label: 'Phone Numbers',
      cardinality: 'one_to_many',
      onDelete: 'none',
    },
  },
]

export default relationships
```

### Cardinality Values

| Cardinality | Description |
|-------------|-------------|
| `one_to_one` | Single reference on both sides |
| `one_to_many` | Single to multiple |
| `many_to_one` | Multiple to single |
| `many_to_many` | Multiple on both sides |

### CRM Index

```ts
// crm/index.ts
export * as models from './models'
export { default as relationships } from './relationships'
```

---

## Channels

Define communication channels using `defineChannel`:

```ts
// channels/phone.ts
import { defineChannel } from 'skedyul'

export default defineChannel({
  handle: 'phone',
  label: 'Phone',
  icon: 'Phone',

  fields: [
    {
      handle: 'phone',
      label: 'Phone Number',
      identifier: true,
      definitionHandle: 'phone',
      visibility: {
        data: true,
        list: true,
        filters: true,
      },
    },
    {
      handle: 'opt_in',
      label: 'Opt In',
      definitionHandle: 'system/opt_in',
      required: false,
      default: ['OPT_IN'],
      visibility: { data: true, list: true, filters: true },
      permissions: { read: true, write: true },
    },
  ],

  capabilities: {
    messaging: {
      label: 'SMS',
      icon: 'MessageSquare',
      receive: 'receive_sms',
      send: 'send_sms',
      // Prefer { send, get_status } when the provider supports externalChunkId status polling
      send_batch: {
        send: 'send_sms_batch',
        get_status: 'get_sms_bulk_status',
      },
      // Legacy: send_batch: 'send_sms_batch' (string = send tool only)
    },
    voice: {
      label: 'Voice',
      icon: 'PhoneCall',
      receive: 'receive_call',
      send: 'make_call',
    },
  },
})
```

`capabilities.messaging.send_batch` may be:

| Shape | Meaning |
|-------|---------|
| `string` | Tool handle for bulk send only |
| `{ send, get_status }` | Bulk send tool + status-poll tool (`MessageBulkStatus*` schemas). Send must return `externalChunkId`; status tool accepts that id and returns per-recipient rows. |

When `get_status` returns `{ complete: true, mock: true, messages: [] }`, the platform treats all recipients as sent (provider skipped real delivery).

#### Bulk `externalChunkId`

Skedyul uses **`externalChunkId`** as the universal async batch identifier between `send_batch` and `get_status`:

1. **`send_batch` tool** — return `externalChunkId` on accept (map from your provider's id, e.g. Twilio JSON `operationId`).
2. **`get_status` tool** — accept `{ channel, externalChunkId }`; return `{ externalChunkId, status, complete, messages[] }`.
3. **Platform** — polls `get_status` until `complete` or idle timeout; reconciles `messages[]` to recipient rows by `address`.

Do not expose provider-specific field names (like `operationId`) in tool output — always normalize to `externalChunkId`.

### Channels Index

```ts
// channels/index.ts
export { default as phone } from './phone'
```

---

## Pages

Define pages using Next.js-style file-based routing:

```ts
// pages/settings/page.ts
import { definePage } from 'skedyul'

export default definePage({
  handle: 'settings',
  label: 'Settings',
  type: 'instance',           // 'instance' or 'list'
  path: '/settings',
  default: true,              // Is this the default page?
  navigation: true,           // Show in navigation?

  context: {
    config: {
      model: 'app_config',
      mode: 'first',
    },
  },

  blocks: [
    {
      type: 'card',
      header: {
        title: 'App Settings',
        description: 'Configure your app settings.',
      },
      form: {
        id: 'settings-form',
        fields: [
          {
            component: 'input',
            id: 'api_url',
            row: 0,
            col: 0,
            label: 'API URL',
            value: '{{ config.api_url }}',
            placeholder: 'https://api.example.com',
          },
          {
            component: 'select',
            id: 'mode',
            row: 1,
            col: 0,
            label: 'Mode',
            value: '{{ config.mode }}',
            options: [
              { label: 'Production', value: 'production' },
              { label: 'Sandbox', value: 'sandbox' },
            ],
          },
        ],
        layout: {
          type: 'form',
          rows: [
            { columns: [{ field: 'api_url', colSpan: 12 }] },
            { columns: [{ field: 'mode', colSpan: 12 }] },
          ],
        },
        actions: [
          {
            handle: 'save_settings',
            label: 'Save',
            handler: 'update_settings',
            variant: 'primary',
          },
        ],
      },
    },
  ],
})
```

### Page Types

| Type | Description |
|------|-------------|
| `instance` | Single record view |
| `list` | List of records |

### Block Types

| Type | Description |
|------|-------------|
| `card` | Card with optional header and form |
| `model_mapper` | UI for mapping shared models |

### Form Components

| Component | Description |
|-----------|-------------|
| `input` | Text input |
| `select` | Dropdown select |
| `fieldsetting` | Field with modal form button |
| `list` | Iterable list |
| `alert` | Alert/info message |

### Pages Index

```ts
// pages/index.ts
export { default as settings } from './settings/page'
export { default as phoneNumbers } from './phone-numbers/page'
```

---

## Navigation

Define base navigation using `defineNavigation`:

```ts
// pages/navigation.ts
import { defineNavigation } from 'skedyul'

export default defineNavigation({
  sidebar: {
    sections: [
      {
        items: [
          { label: 'Settings', href: '/settings', icon: 'Settings' },
          { label: 'Phone Numbers', href: '/phone-numbers', icon: 'Phone' },
        ],
      },
    ],
  },
})
```

### Page-Level Navigation Override

Individual pages can override navigation:

```ts
// pages/phone-numbers/[phone_id]/overview/navigation.ts
import type { NavigationConfig } from 'skedyul'

const navigation: NavigationConfig = {
  sidebar: {
    sections: [
      {
        title: '{{ phone_number.phone }}',
        items: [
          { label: 'Overview', href: '/phone-numbers/{{ path_params.phone_id }}/overview', icon: 'Phone' },
          { label: 'Messaging', href: '/phone-numbers/{{ path_params.phone_id }}/messaging', icon: 'MessageSquare' },
        ],
      },
    ],
  },
  breadcrumb: {
    items: [
      { label: 'Phone Numbers', href: '/phone-numbers' },
      { label: '{{ phone_number.phone }}' },
    ],
  },
}

export default navigation
```

---

## Agents (provision)

Define simple multi-tenant agents in your app config using `defineAgent`:

```ts
// agents/booking.ts
import { defineAgent } from 'skedyul'

export default defineAgent({
  handle: 'booking_assistant',
  label: 'Booking Assistant',
  description: 'Helps users schedule and manage appointments',
  system: `You are an appointment scheduling assistant.
Help users find available times and book appointments.
Always confirm the date, time, and service before booking.`,
  tools: ['list_availability', 'create_appointment', 'cancel_appointment'],
  parentAgent: 'composer',  // Optional: bind as sub-agent to Composer
})
```

Add to `skedyul.config.ts`:

```ts
import bookingAssistant from './agents/booking'

export default defineConfig({
  // ...
  agents: [bookingAssistant],
})
```

For skills-based Agent YAML v3 (workplace-deployed agents), see [Agents, skills & workflows](./agents.md).

---

## Complete Example

```ts
// skedyul.config.ts
import { defineConfig } from 'skedyul'
import pkg from './package.json'

export default defineConfig({
  name: 'Phone',
  version: pkg.version,
  description: 'SMS and voice communication via Twilio',
  computeLayer: 'serverless',

  tools: import('./src/registries'),
  webhooks: import('./src/registries'),

  provision: import('./provision'),
})
```

```ts
// provision.ts
import type { ProvisionConfig } from 'skedyul'

import env from './env'
import { models, relationships } from './crm'
import * as channels from './channels'
import * as pages from './pages'
import * as workflows from './workflows'
import navigation from './pages/navigation'

const config: ProvisionConfig = {
  env,
  navigation,
  models: Object.values(models),
  channels: Object.values(channels),
  pages: Object.values(pages),
  workflows: Object.values(workflows),
  relationships,
}

export default config
```

```ts
// env.ts
import { defineEnv } from 'skedyul'

export default defineEnv({
  TWILIO_ACCOUNT_SID: {
    label: 'Twilio Account SID',
    scope: 'provision',
    required: true,
    visibility: 'encrypted',
    placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  TWILIO_AUTH_TOKEN: {
    label: 'Twilio Auth Token',
    scope: 'provision',
    required: true,
    visibility: 'encrypted',
  },
})
```

---

## Validation

Use the CLI to validate your configuration:

```bash
skedyul dev validate
```

This checks:
- Required fields are present
- Handle formats are valid (lowercase, alphanumeric, underscores)
- Field types are valid
- References (tool names, page handles) exist
- No duplicate handles

---

## Best Practices

### 1. Use Descriptive Handles

```ts
// Good
handle: 'appointment_reminder'
handle: 'client_contact'

// Bad
handle: 'ar'
handle: 'cc1'
```

### 2. Use snake_case for Type Literals

```ts
// Good
cardinality: 'many_to_one'
type: 'date_time'

// Bad
cardinality: 'MANY_TO_ONE'
type: 'DATE_TIME'
```

### 3. Provide Help Text

```ts
defineEnv({
  API_KEY: {
    label: 'API Key',
    scope: 'install',
    required: true,
    visibility: 'encrypted',
    description: 'Find this in Settings > API Keys in your dashboard',
    placeholder: 'sk_live_xxxxxxxx',
  },
})
```

### 4. Use scope: 'shared' for User Data

```ts
defineModel({
  handle: 'contact',
  label: 'Contact',
  scope: 'shared',  // User selects which model to link
  // ...
})
```

### 5. Organize Files by Domain

```
crm/
├── models/
│   ├── client.ts
│   ├── patient.ts
│   └── appointment.ts
└── relationships.ts

channels/
└── phone.ts

pages/
├── clients/
│   └── page.ts
└── appointments/
    └── page.ts
```
