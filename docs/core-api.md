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

---

## token

Token exchange operations.

### token.exchange()

Exchange an app token for an installation-scoped token.

**Requires:** `sk_app_*` token

```ts
import { token, runWithConfig } from 'skedyul'

// Find the installation first
const { data: instances } = await instance.list('phone_number', {
  filter: { phone: '+1234567890' },
})

const appInstallationId = instances[0]._meta.appInstallationId

// Exchange for scoped token
const { token: scopedToken } = await token.exchange(appInstallationId)

// Use scoped token
await runWithConfig(
  { apiToken: scopedToken, baseUrl: process.env.SKEDYUL_API_URL! },
  async () => {
    // Operations now scoped to this installation
    await communicationChannel.receiveMessage({ ... })
  }
)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `appInstallationId` | `string` | Installation ID |

**Returns:** `Promise<{ token: string }>`

The returned token is a short-lived JWT (1 hour) scoped to the installation.

---

## file

File upload and download operations.

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

## contactAssociationLink

Link communication channels to contact models.

### contactAssociationLink.create()

Create a link between a channel and a model for contact association.

```ts
import { contactAssociationLink } from 'skedyul'

const link = await contactAssociationLink.create({
  communicationChannelId: channel.id,
  modelId: clientsModelId,
  identifierFieldId: phoneFieldId,
})

console.log(`Linked to ${link.modelName} via ${link.identifierFieldLabel}`)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `communicationChannelId` | `string` | Channel ID |
| `modelId` | `string` | Model to associate contacts with |
| `identifierFieldId` | `string` | Field providing identifier |

**Returns:** `Promise<ContactAssociationLinkCreateResult>`

### contactAssociationLink.list()

List links for a channel.

```ts
const links = await contactAssociationLink.list('ch_abc123')
```

**Returns:** `Promise<ContactAssociationLinkCreateResult[]>`

### contactAssociationLink.delete()

Delete a contact association link.

```ts
const { success } = await contactAssociationLink.delete('cal_abc123')
```

**Returns:** `Promise<{ success: boolean }>`

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
