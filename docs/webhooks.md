# Webhooks

Webhooks allow your Skedyul app to receive HTTP requests from external services. This is essential for integrations that need to process incoming events like SMS messages, email notifications, or API callbacks.

## Overview

Skedyul webhooks provide:
- **Unique URLs** for each registration (no shared endpoints)
- **Automatic routing** to your handler based on registration
- **Context injection** with installation and workplace info
- **Two invocation types**: fire-and-forget or response-required

## Webhook Definition

Define webhooks in your app's webhook registry:

```ts
// src/webhooks/registry.ts
import type { WebhookRegistry } from 'skedyul'
import { receiveSmsHandler } from './receive-sms'
import { statusCallbackHandler } from './status-callback'

export const webhookRegistry: WebhookRegistry = {
  receive_sms: {
    name: 'receive_sms',
    description: 'Receives incoming SMS messages from Twilio',
    methods: ['POST'],
    type: 'WEBHOOK',
    handler: receiveSmsHandler,
  },
  twiml_response: {
    name: 'twiml_response',
    description: 'Returns TwiML for Twilio voice/SMS',
    methods: ['POST'],
    type: 'CALLBACK',
    handler: twimlHandler,
  },
}
```

### WebhookDefinition Interface

```ts
interface WebhookDefinition {
  name: string
  description: string
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[]  // Default: ['POST']
  type?: 'WEBHOOK' | 'CALLBACK'  // Default: 'WEBHOOK'
  handler: WebhookHandler

  // Lifecycle hooks (optional)
  onAppInstalled?: WebhookLifecycleHook
  onAppUninstalled?: WebhookLifecycleHook
  onAppVersionProvisioned?: WebhookLifecycleHook
  onAppVersionDeprovisioned?: WebhookLifecycleHook
  onCommunicationChannelCreated?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
  onCommunicationChannelUpdated?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
  onCommunicationChannelDeleted?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
}
```

## Webhook Types

### WEBHOOK (Fire-and-Forget)

The default type. Skedyul returns `200 OK` immediately and processes the request asynchronously. Use this when the caller doesn't need your handler's response.

```ts
const receiveEmailHandler: WebhookHandler = async (request, context) => {
  // Process the incoming email
  const { from, subject, body } = request.body as EmailPayload
  
  await communicationChannel.receiveMessage({
    communicationChannelId: context.registration?.channelId as string,
    from,
    message: { message: body, title: subject },
  })

  // Response is ignored - caller already got 200 OK
  return { status: 200 }
}

export const receiveEmail: WebhookDefinition = {
  name: 'receive_email',
  description: 'Receives incoming emails',
  type: 'WEBHOOK',  // Fire-and-forget
  handler: receiveEmailHandler,
}
```

### CALLBACK (Response Required)

Use when the caller expects your handler's response. Common for services like Twilio that need TwiML responses.

```ts
const twimlHandler: WebhookHandler = async (request, context) => {
  // Generate TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>Thanks for your message!</Message>
    </Response>`

  return {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml,
  }
}

export const twimlResponse: WebhookDefinition = {
  name: 'twiml_response',
  description: 'Returns TwiML for Twilio',
  type: 'CALLBACK',  // Caller waits for response
  handler: twimlHandler,
}
```

## Webhook Handler

### Handler Signature

```ts
type WebhookHandler = (
  request: WebhookRequest,
  context: WebhookContext,
) => Promise<WebhookResponse> | WebhookResponse
```

### WebhookRequest

```ts
interface WebhookRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string>
  body: Buffer | string | unknown  // Parsed based on content-type
  rawBody?: Buffer  // Original raw body
}
```

### WebhookContext

Context varies based on whether the webhook has installation context:

```ts
// Provision-level webhook (no installation)
interface ProvisionWebhookContext {
  env: Record<string, string | undefined>
  app: { id: string; versionId: string }
}

// Runtime webhook (has installation)
interface RuntimeWebhookContext {
  env: Record<string, string | undefined>
  app: { id: string; versionId: string }
  appInstallationId: string
  workplace: { id: string; subdomain: string }
  registration?: Record<string, unknown>  // Custom data from webhook.create()
}
```

Use the type guard to check context type:

```ts
import { isRuntimeWebhookContext } from 'skedyul'

const handler: WebhookHandler = async (request, context) => {
  if (isRuntimeWebhookContext(context)) {
    // Has installation context - can use scoped operations
    console.log(`Workplace: ${context.workplace.subdomain}`)
    console.log(`Registration data: ${JSON.stringify(context.registration)}`)
  } else {
    // Provision-level - need to look up installation
  }
  return { status: 200 }
}
```

### WebhookResponse

```ts
interface WebhookResponse {
  status?: number  // Default: 200
  headers?: Record<string, string>
  body?: unknown  // String or JSON-serializable object
}
```

## Creating Webhook Registrations

Use the `webhook` client to create unique URLs for external services:

```ts
import { webhook } from 'skedyul'

// Create a webhook registration
const { url, id } = await webhook.create('receive_sms', {
  // Custom context passed to handler
  channelId: channel.id,
  phoneNumber: '+1234567890',
})

console.log(`Webhook URL: ${url}`)
// https://app.skedyul.com/api/webhooks/whkr_abc123

// Configure external service with this URL
await twilioClient.incomingPhoneNumbers(phoneNumberSid).update({
  smsUrl: url,
})
```

### webhook.create()

```ts
async function create(
  name: string,                           // Handler name from registry
  context?: Record<string, unknown>,      // Custom data for handler
  options?: { expiresIn?: number },       // Expiration in seconds
): Promise<WebhookCreateResult>

interface WebhookCreateResult {
  id: string        // Registration ID (whkr_xxx)
  url: string       // Full public URL
  expiresAt: string | null
}
```

### webhook.list()

```ts
const { webhooks } = await webhook.list({ name: 'receive_sms' })

for (const wh of webhooks) {
  console.log(`${wh.name}: ${wh.url}`)
}
```

### webhook.delete()

```ts
// Delete by ID
const { deleted } = await webhook.delete('whkr_abc123')

// Delete all registrations for a handler
const { count } = await webhook.deleteByName('receive_sms')

// Delete with filter
const { count } = await webhook.deleteByName('receive_sms', {
  filter: { channelId: 'ch_xxx' },
})
```

## Lifecycle Hooks

Webhook definitions can include lifecycle hooks that are called when resources are created or destroyed. This is useful for automatically configuring external services.

### Communication Channel Lifecycle

```ts
export const receiveSms: WebhookDefinition = {
  name: 'receive_sms',
  description: 'Receives incoming SMS',
  handler: receiveSmsHandler,

  // Called when a communication channel is created
  onCommunicationChannelCreated: async (ctx) => {
    const { webhookUrl, communicationChannel, env } = ctx
    
    // Configure Twilio to send SMS to this webhook
    const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    
    const phoneNumber = await twilioClient.incomingPhoneNumbers
      .list({ phoneNumber: communicationChannel.identifierValue })
      .then(numbers => numbers[0])

    await twilioClient.incomingPhoneNumbers(phoneNumber.sid).update({
      smsUrl: webhookUrl,
    })

    return {
      externalId: phoneNumber.sid,
      message: `Configured SMS webhook for ${communicationChannel.identifierValue}`,
    }
  },

  // Called when a communication channel is deleted
  onCommunicationChannelDeleted: async (ctx) => {
    const { communicationChannel, env } = ctx
    
    // Clean up Twilio configuration
    const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    
    // Remove webhook URL from phone number
    // (or release the number, depending on your logic)
    
    return {
      externalId: communicationChannel.id,
      message: 'Cleaned up SMS webhook',
    }
  },
}
```

### Lifecycle Hook Context

```ts
interface WebhookLifecycleContext {
  webhookUrl: string  // The Skedyul-generated URL
  env: Record<string, string | undefined>
}

interface CommunicationChannelLifecycleContext extends WebhookLifecycleContext {
  communicationChannel: {
    id: string
    identifierValue: string  // e.g., "+15551234567"
    handle: string           // e.g., "sms"
  }
}
```

### Lifecycle Hook Result

```ts
interface WebhookLifecycleResult {
  externalId: string  // ID from external service
  message?: string    // Optional description
  metadata?: Record<string, unknown>  // Additional data to store
}
```

Return `null` if the external API doesn't support programmatic management.

## Complete Example: SMS Integration

```ts
// src/webhooks/sms.ts
import type { WebhookDefinition, WebhookHandler } from 'skedyul'
import { communicationChannel, isRuntimeWebhookContext } from 'skedyul'
import twilio from 'twilio'

const receiveSmsHandler: WebhookHandler = async (request, context) => {
  if (!isRuntimeWebhookContext(context)) {
    return { status: 400, body: { error: 'Missing installation context' } }
  }

  // Parse Twilio webhook payload
  const { From, Body, MessageSid } = request.body as {
    From: string
    Body: string
    MessageSid: string
  }

  // Record the message in Skedyul
  await communicationChannel.receiveMessage({
    communicationChannelId: context.registration?.channelId as string,
    from: From,
    message: { message: Body },
    remoteId: MessageSid,
  })

  // Return TwiML response (empty = no auto-reply)
  return {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
  }
}

export const receiveSms: WebhookDefinition = {
  name: 'receive_sms',
  description: 'Receives incoming SMS messages from Twilio',
  methods: ['POST'],
  type: 'CALLBACK',  // Twilio expects TwiML response
  handler: receiveSmsHandler,

  onCommunicationChannelCreated: async (ctx) => {
    const twilioClient = twilio(
      ctx.env.TWILIO_ACCOUNT_SID,
      ctx.env.TWILIO_AUTH_TOKEN,
    )

    // Find the phone number in Twilio
    const [phoneNumber] = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: ctx.communicationChannel.identifierValue,
    })

    if (!phoneNumber) {
      throw new Error(`Phone number not found: ${ctx.communicationChannel.identifierValue}`)
    }

    // Configure webhook URL
    await twilioClient.incomingPhoneNumbers(phoneNumber.sid).update({
      smsUrl: ctx.webhookUrl,
      smsMethod: 'POST',
    })

    return {
      externalId: phoneNumber.sid,
      message: `Configured SMS for ${ctx.communicationChannel.identifierValue}`,
    }
  },
}
```

## Webhook Security

### Signature Verification

For services that sign requests (like Twilio), verify signatures in your handler:

```ts
import { validateRequest } from 'twilio'

const handler: WebhookHandler = async (request, context) => {
  const twilioSignature = request.headers['x-twilio-signature'] as string
  const authToken = context.env.TWILIO_AUTH_TOKEN!
  
  const isValid = validateRequest(
    authToken,
    twilioSignature,
    request.url,
    request.body as Record<string, string>,
  )

  if (!isValid) {
    return { status: 403, body: { error: 'Invalid signature' } }
  }

  // Process the request...
}
```

### IP Allowlisting

For additional security, you can verify the source IP in your handler using `request.headers['x-forwarded-for']`.

## Troubleshooting

### Webhook not receiving requests

1. Verify the URL is correctly configured in the external service
2. Check that the webhook registration hasn't expired
3. Ensure the HTTP method matches (default is POST only)

### Handler not being called

1. Verify the handler name in `webhook.create()` matches the registry key
2. Check server logs for routing errors
3. Ensure the webhook registry is passed to `server.create()`

### Context missing installation info

- For provision-level webhooks, use `instance.list()` with an app token to find the installation
- Ensure the webhook was created with a workplace-scoped token (`sk_wkp_*`)
