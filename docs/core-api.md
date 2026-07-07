# Core API Client

The Skedyul SDK includes a client for interacting with platform resources. This client is automatically configured in tool and webhook handlers, or can be configured manually for standalone use.

## Configuration

### Automatic (Recommended)

In tool and webhook handlers, the SDK is automatically configured with the appropriate token:

```ts
import { communicationChannel } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  // SDK is pre-configured - just use it
  const channels = await communicationChannel.list()
  // ...
}
```

### Manual Configuration

For standalone scripts or custom scenarios:

```ts
import { configure, communicationChannel } from 'skedyul'

// Configure once at startup
configure({
  baseUrl: 'https://app.skedyul.com',
  apiToken: 'sk_app_xxxxx',
})

// Then use the client
const channels = await communicationChannel.list()
```

### Request-Scoped Configuration

For multi-tenant scenarios or temporary token overrides:

```ts
import { runWithConfig, communicationChannel } from 'skedyul'

const result = await runWithConfig(
  { baseUrl: 'https://app.skedyul.com', apiToken: scopedToken },
  async () => {
    return await communicationChannel.list()
  }
)
```

---

## workplace

Manage workplaces where your app is installed.

### workplace.list()

List workplaces with optional filters.

```ts
import { workplace } from 'skedyul'

// List all workplaces
const workplaces = await workplace.list()

// With filters
const workplaces = await workplace.list({
  filter: { name: 'Demo Clinic' },
  limit: 10,
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `filter` | `Record<string, unknown>` | Filter conditions |
| `limit` | `number` | Maximum results to return |

**Returns:** `Promise<Workplace[]>`

### workplace.get()

Get a single workplace by ID.

```ts
const wp = await workplace.get('wkp_abc123')
console.log(wp.name)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | `string` | Workplace ID |

**Returns:** `Promise<Workplace>`

---

## communicationChannel

Manage communication channels (phone numbers, email addresses, etc.).

### communicationChannel.create()

Create a new communication channel.

**Requires:** `sk_wkp_*` token

```ts
import { communicationChannel } from 'skedyul'

const channel = await communicationChannel.create('phone', {
  name: 'Sales Line',
  identifierValue: '+61400000000',
  // Optional: link a SHARED model
  link: {
    handle: 'contact',        // SHARED model from provision config
    targetModelId: modelId,   // User's selected model
  },
})

console.log(`Created channel: ${channel.id}`)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `handle` | `string` | Channel handle from provision config |
| `params.name` | `string` | Friendly name |
| `params.identifierValue` | `string` | Unique identifier (phone, email) |
| `params.link` | `object` | Optional model linking |

**Returns:** `Promise<ChannelCreateResult>`

### communicationChannel.list()

List channels with optional filters.

```ts
// List all channels
const channels = await communicationChannel.list()

// Find by phone number
const channels = await communicationChannel.list({
  filter: { identifierValue: '+1234567890' },
  limit: 1,
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `filter` | `Record<string, unknown>` | Filter conditions |
| `limit` | `number` | Maximum results |

**Returns:** `Promise<CommunicationChannel[]>`

### communicationChannel.get()

Get a single channel by ID.

```ts
const channel = await communicationChannel.get('ch_abc123')
```

**Returns:** `Promise<CommunicationChannel | null>`

### communicationChannel.update()

Update a channel's properties.

```ts
const channel = await communicationChannel.update('ch_abc123', {
  name: 'New Name',
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `channelId` | `string` | Channel ID |
| `params.name` | `string` | New name |

**Returns:** `Promise<CommunicationChannel>`

### communicationChannel.remove()

Delete a channel and its associated resources.

```ts
const { success } = await communicationChannel.remove('ch_abc123')
```

**Cascades:**
- EnvVariables scoped to this channel
- AppFields scoped to this channel
- AppResourceInstances scoped to this channel
- CommunicationChannelSubscriptions

**Returns:** `Promise<{ success: boolean }>`

### communicationChannel.receiveMessage()

Record an inbound message on a channel. Typically called from webhook handlers.

```ts
const result = await communicationChannel.receiveMessage({
  communicationChannelId: 'ch_abc123',
  from: '+1234567890',
  message: {
    message: 'Hello!',
    title: 'SMS from John',  // Optional
  },
  contact: {
    id: 'contact_xyz',       // Optional: link to existing contact
  },
  remoteId: 'twilio-sid-123', // Optional: external message ID
})

console.log(`Message ID: ${result.messageId}`)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `communicationChannelId` | `string` | Channel ID |
| `from` | `string` | Sender identifier |
| `message.message` | `string` | Message content |
| `message.title` | `string` | Optional title |
| `message.contentRaw` | `string` | Optional raw content |
| `message.attachments` | `array` | Optional file attachments |
| `contact` | `object` | Optional contact association |
| `remoteId` | `string` | Optional external message ID |

**Returns:** `Promise<{ messageId: string }>`

---

## instance

CRUD operations for app-defined model instances.

### instance.list()

List instances of a model.

```ts
import { instance } from 'skedyul'

// List all instances
const { data, pagination } = await instance.list('compliance_record')

// With filters and pagination
const { data, pagination } = await instance.list('compliance_record', {
  filter: { status: 'pending' },
  page: 1,
  limit: 10,
})

// Cross-installation search (with sk_app_* token)
const { data } = await instance.list('phone_number', {
  filter: { phone: '+1234567890' },
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `modelHandle` | `string` | Model handle from provision config |
| `args.filter` | `Record<string, unknown>` | Filter conditions |
| `args.page` | `number` | Page number (1-indexed) |
| `args.limit` | `number` | Results per page |

**Returns:** `Promise<InstanceListResult>`

```ts
interface InstanceListResult {
  data: InstanceData[]
  pagination: {
    page: number
    total: number
    hasMore: boolean
    limit: number
  }
}

interface InstanceData {
  id: string
  _meta: { modelId: string; label?: string }
  [fieldHandle: string]: unknown
}
```

### instance.get()

Get a single instance by ID.

```ts
const record = await instance.get('compliance_record', 'ins_abc123')
console.log(record?.status)
```

**Returns:** `Promise<InstanceData | null>`

### instance.create()

Create a new instance.

```ts
const record = await instance.create('compliance_record', {
  status: 'pending',
  document_url: 'https://example.com/doc.pdf',
})

console.log(`Created: ${record.id}`)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `modelHandle` | `string` | Model handle |
| `data` | `Record<string, unknown>` | Field values |

**Returns:** `Promise<InstanceData>`

### instance.update()

Update an existing instance.

```ts
const updated = await instance.update('compliance_record', 'ins_abc123', {
  status: 'approved',
  approved_at: new Date().toISOString(),
})
```

**Returns:** `Promise<InstanceData>`

### instance.delete()

Delete an instance.

```ts
const { deleted } = await instance.delete('compliance_record', 'ins_abc123')
```

**Returns:** `Promise<{ deleted: boolean }>`

### Batch operations

```ts
// Create multiple records
const { data } = await instance.createMany('contact', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
])

// Update multiple records
await instance.updateMany('contact', [
  { id: 'ins_1', data: { status: 'active' } },
  { id: 'ins_2', data: { status: 'active' } },
])

// Delete multiple records
await instance.deleteMany('contact', ['ins_1', 'ins_2'])

// Upsert by match field
await instance.upsertMany('contact', records, { matchField: 'email' })
```

### createInstanceClient()

Create a standalone client with explicit config (same methods as global `instance`):

```ts
import { createInstanceClient } from 'skedyul'

const client = createInstanceClient({ baseUrl, apiToken })
await client.list('member')
```

---

## token

Token exchange operations.

### token.exchange()

Exchange an app or provision token for an installation-scoped **`InstanceClient`**:

**Requires:** `sk_app_*` or `sk_prv_*` token

```ts
import { token, instance } from 'skedyul'

// Find the installation first
const { data: instances } = await instance.list('phone_number', {
  filter: { phone: '+1234567890' },
})

const appInstallationId = instances[0]._meta.appInstallationId

// Returns a scoped InstanceClient (sk_wkp_* internally)
const scopedInstance = await token.exchange(appInstallationId)

// Use scoped client for all CRM operations
await scopedInstance.update('phone_number', instances[0].id, { status: 'active' })
```

### token.exchangeRaw()

Returns the raw token when you need manual `runWithConfig`:

```ts
const { token: scopedToken, appInstallationId } = await token.exchangeRaw(installId)

await runWithConfig(
  { apiToken: scopedToken, baseUrl: process.env.SKEDYUL_API_URL! },
  async () => {
    await communicationChannel.receiveMessage({ ... })
  }
)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `appInstallationId` | `string` | Installation ID |

**Returns:** `Promise<InstanceClient>` (exchange) or `Promise<{ token, appInstallationId }>` (exchangeRaw)

The scoped token is a short-lived JWT (~1 hour) for the installation.

---

## file

File upload and download operations.

### file.get()

Get file metadata.

```ts
const info = await file.get('fl_abc123')
```

**Returns:** `Promise<FileInfo>`

### file.getUrl()

Get a temporary download URL for a file.

```ts
import { file } from 'skedyul'

const { url, expiresAt } = await file.getUrl('fl_abc123')

// Use the URL (expires in 1 hour)
const response = await fetch(url)
```

**Returns:** `Promise<FileUrlResponse>`

```ts
interface FileUrlResponse {
  url: string        // Presigned download URL
  expiresAt: string  // ISO timestamp
}
```

### file.upload()

Upload a file and create a File record.

```ts
// Upload from Buffer
const buffer = await downloadFromExternalUrl(url)
const { id } = await file.upload({
  content: buffer,
  name: 'document.pdf',
  mimeType: 'application/pdf',
})

// Upload with path prefix
const { id } = await file.upload({
  content: imageBuffer,
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  path: 'attachments',
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `content` | `Buffer \| string` | File content (Buffer or base64) |
| `name` | `string` | Original filename |
| `mimeType` | `string` | MIME type |
| `path` | `string` | Optional path prefix |

**Returns:** `Promise<FileUploadResult>`

```ts
interface FileUploadResult {
  id: string         // File ID (fl_xxx)
  url: string | null // Public URL (null for private)
}
```

---

## webhook

Manage webhook registrations.

### webhook.create()

Create a webhook registration for a handler.

```ts
import { webhook } from 'skedyul'

const { url, id } = await webhook.create('receive_sms', {
  channelId: channel.id,
  phoneNumber: '+1234567890',
})

// Configure external service with this URL
await twilioClient.incomingPhoneNumbers(sid).update({
  smsUrl: url,
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Handler name from webhook registry |
| `context` | `Record<string, unknown>` | Custom data for handler |
| `options.expiresIn` | `number` | Expiration in seconds |

**Returns:** `Promise<WebhookCreateResult>`

```ts
interface WebhookCreateResult {
  id: string           // Registration ID (whkr_xxx)
  url: string          // Full public URL
  expiresAt: string | null
}
```

### webhook.list()

List webhook registrations.

```ts
const { webhooks } = await webhook.list()

// Filter by handler name
const { webhooks } = await webhook.list({ name: 'receive_sms' })
```

**Returns:** `Promise<{ webhooks: WebhookListItem[] }>`

### webhook.delete()

Delete a webhook registration by ID.

```ts
const { deleted } = await webhook.delete('whkr_abc123')
```

**Returns:** `Promise<{ deleted: boolean }>`

### webhook.deleteByName()

Delete registrations by handler name.

```ts
// Delete all receive_sms webhooks
const { count } = await webhook.deleteByName('receive_sms')

// Delete with filter
const { count } = await webhook.deleteByName('receive_sms', {
  filter: { channelId: 'ch_xxx' },
})
```

**Returns:** `Promise<{ count: number }>`

---

## resource

Link app resources to user resources.

### resource.link()

Link a SHARED app model to a user's model.

```ts
import { resource } from 'skedyul'

const { instanceId } = await resource.link({
  handle: 'contact',           // SHARED model from provision config
  targetModelId: modelId,      // User's selected model
  channelId: channel.id,       // Optional: scope to channel
  fieldMappings: {             // Optional: field mappings
    phone: phoneFieldId,
    name: nameFieldId,
  },
})
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `handle` | `string` | SHARED model handle |
| `targetModelId` | `string` | User's model ID |
| `channelId` | `string` | Optional channel scope |
| `fieldMappings` | `Record<string, string>` | Optional field mappings |

**Returns:** `Promise<ResourceLinkResult>`

---

## cron

Subscribe to scheduled events.

### cron.subscribe()

```ts
import { cron } from 'skedyul'

const { id } = await cron.subscribe({
  name: 'daily_sync',
  schedule: '0 9 * * *',  // Cron expression
  timezone: 'Australia/Sydney',
})
```

### cron.unsubscribe()

```ts
await cron.unsubscribe(subscriptionId)
```

### cron.list()

```ts
const { subscriptions } = await cron.list({ name: 'daily_sync' })
```

---

## event

Emit app events to the event bus.

### event.create()

```ts
import { event } from 'skedyul'

const result = await event.create('customer.sync', {
  customers: [{ id: '1', name: 'Jane' }],
}, {
  trigger: 'tool',
  correlationId: 'run_abc',
  app: 'my-app',
  context: { source: 'nightly_sync' },
})
```

Events must be declared in `skedyul.config.ts` under `events` to appear in the catalog.

---

## ai

Generate structured output from an LLM.

### ai.generateObject()

```ts
import { ai, z } from 'skedyul'

const schema = z.object({
  summary: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
})

const { object } = await ai.generateObject({
  model: 'gpt-4o',
  schema,
  prompt: 'Summarize this message: ...',
  // Optional multimodal input
  files: [{ fileId: 'fl_abc', mimeType: 'application/pdf' }],
  messages: [{ role: 'user', content: 'Analyze the attached document' }],
})
```

---

## call

Voice call lifecycle (real-time transcription).

### call.start()

```ts
import { call } from 'skedyul'

const { callId } = await call.start({
  communicationChannelId: 'ch_abc',
  from: '+61400000000',
  to: '+61411111111',
})
```

### call.appendTranscript()

```ts
await call.appendTranscript({
  callId,
  speaker: 'agent',
  text: 'How can I help you today?',
})
```

### call.end()

```ts
await call.end({ callId, reason: 'completed' })
```

### call.summarize()

```ts
const { summary } = await call.summarize({ callId })
```

---

## report

Generate and manage reports.

### report.generate()

```ts
import { report } from 'skedyul'

const { url, reportId } = await report.generate({
  definitionHandle: 'monthly_summary',
  parameters: { month: '2026-01' },
})
```

### report.define()

Register a report definition.

### report.list() / report.get()

List and retrieve report definitions and generated reports.

---

## Error Handling

All client methods throw errors on failure:

```ts
try {
  const channel = await communicationChannel.get('ch_invalid')
} catch (error) {
  console.error('Failed to get channel:', error.message)
}
```

Common error scenarios:
- **Missing configuration**: `"Skedyul client not configured: missing apiToken"`
- **Not found**: `"Channel not found"`
- **Permission denied**: `"Unauthorized"` (wrong token scope)
- **Validation error**: Field-specific error messages
