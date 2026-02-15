# Authentication

Skedyul uses API tokens to authenticate requests between your integration app and the platform. Understanding token types and scopes is essential for building secure integrations.

## Token Types

### App API Token (`sk_app_*`)

**Scope**: All workplaces where your app is installed

App tokens are long-lived credentials that grant access across all installations of your app. Use these in scenarios where you need to look up resources without knowing the specific workplace context.

**Common use cases**:
- Webhook handlers receiving external events (e.g., incoming SMS)
- Background jobs processing data across workplaces
- Cross-workplace resource lookups

```ts
// Webhook handler using app token to find the right workplace
import { communicationChannel, instance, token, runWithConfig } from 'skedyul'

async function handleIncomingSMS(phoneNumber: string, message: string) {
  // App token can search across all installations
  const { data: instances } = await instance.list('phone_number', {
    filter: { phone: phoneNumber },
  })

  if (instances.length === 0) {
    throw new Error('Phone number not registered')
  }

  // Found the installation - exchange for scoped token
  const appInstallationId = instances[0]._meta.appInstallationId
  const { token: scopedToken } = await token.exchange(appInstallationId)

  // Use scoped token for subsequent operations
  await runWithConfig({ apiToken: scopedToken, baseUrl: process.env.SKEDYUL_API_URL! }, async () => {
    const channels = await communicationChannel.list({
      filter: { identifierValue: phoneNumber },
    })
    // Process message in the correct workspace context...
  })
}
```

### Workplace API Token (`sk_wkp_*`)

**Scope**: Single app installation within a workplace

Workplace tokens are scoped to a specific app installation. They're automatically provided to tool handlers and webhook handlers when the platform knows the installation context.

**Common use cases**:
- MCP tool handlers (token provided in context)
- Webhook handlers with known installation context
- Any operation scoped to a single workplace

```ts
// Tool handler - token is automatically configured
import type { ToolHandler } from 'skedyul'
import { communicationChannel } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  // SDK is automatically configured with sk_wkp_* token
  // No need to call configure() or runWithConfig()
  const channels = await communicationChannel.list()
  
  return {
    output: { channels },
    billing: { credits: 1 },
    meta: { success: true, message: 'Listed channels', toolName: 'list_channels' },
  }
}
```

### Provision Token (`sk_prv_*`)

**Scope**: App version (not installation-specific)

Provision tokens are short-lived tokens used during app version provisioning. They're provided to provision handlers for setting up version-level resources.

**Common use cases**:
- Creating shared resources during app deployment
- Setting up external service accounts
- Version-level configuration

```ts
// Provision handler receives provision-scoped context
import type { ProvisionHandler } from 'skedyul'

const provisionHandler: ProvisionHandler = async (ctx) => {
  // ctx.env contains SKEDYUL_API_TOKEN (sk_prv_*)
  // Use for version-level setup, not installation-specific
  
  console.log(`Provisioning app version: ${ctx.app.versionId}`)
  
  // Create external resources, configure services, etc.
  return {}
}
```

## Token Comparison

| Token Type | Prefix | Scope | Lifetime | Use Case |
|------------|--------|-------|----------|----------|
| App API | `sk_app_*` | All installations | Long-lived | Webhooks, cross-workplace lookups |
| Workplace API | `sk_wkp_*` | Single installation | Short-lived (1 hour) | Tools, scoped operations |
| Provision | `sk_prv_*` | App version | Short-lived | Version provisioning |

## Configuration

### Environment Variables

```bash
# Base URL for the Skedyul API
SKEDYUL_API_URL=https://app.skedyul.com

# Your API token
SKEDYUL_API_TOKEN=sk_app_xxxxx
```

### Programmatic Configuration

Configure the SDK globally at startup:

```ts
import { configure } from 'skedyul'

configure({
  baseUrl: 'https://app.skedyul.com',
  apiToken: 'sk_app_xxxxx',
})
```

### Request-Scoped Configuration

For multi-tenant scenarios or when you need to temporarily use a different token, use `runWithConfig()`:

```ts
import { runWithConfig, communicationChannel } from 'skedyul'

// Exchange app token for installation-scoped token
const { token: scopedToken } = await token.exchange(appInstallationId)

// Run operations with the scoped token
const result = await runWithConfig(
  { 
    baseUrl: 'https://app.skedyul.com',
    apiToken: scopedToken,
  },
  async () => {
    // All SDK calls in this block use the scoped config
    const channels = await communicationChannel.list()
    return channels
  }
)
```

## Token Exchange

When you have an app token (`sk_app_*`) but need to perform operations scoped to a specific installation, use `token.exchange()`:

```ts
import { token, runWithConfig, communicationChannel } from 'skedyul'

// Step 1: Find the installation (using app token)
const { data: instances } = await instance.list('phone_number', {
  filter: { phone: '+1234567890' },
})

const appInstallationId = instances[0]._meta.appInstallationId

// Step 2: Exchange for scoped token
const { token: scopedToken } = await token.exchange(appInstallationId)

// Step 3: Use scoped token for operations
await runWithConfig(
  { apiToken: scopedToken, baseUrl: process.env.SKEDYUL_API_URL! },
  async () => {
    // Now operating in the context of the specific installation
    await communicationChannel.receiveMessage({
      communicationChannelId: 'ch_xxx',
      from: '+1234567890',
      message: { message: 'Hello!' },
    })
  }
)
```

## Automatic Token Injection

In most cases, you don't need to manually configure tokens:

### Tool Handlers

The platform automatically injects `SKEDYUL_API_TOKEN` into the environment for tool handlers:

```ts
const handler: ToolHandler<Input, Output> = async (input, context) => {
  // context.env.SKEDYUL_API_TOKEN is set automatically
  // SDK is pre-configured - just use the client methods
  const channels = await communicationChannel.list()
  // ...
}
```

### Webhook Handlers

For webhooks with known installation context, the token is injected:

```ts
const webhookHandler: WebhookHandler = async (request, context) => {
  if (isRuntimeWebhookContext(context)) {
    // context has appInstallationId and workplace
    // SDK is configured with scoped token
    const channels = await communicationChannel.list()
  }
  // ...
}
```

## Security Best Practices

1. **Never expose tokens in client-side code** - Tokens should only be used server-side
2. **Use the narrowest scope possible** - Prefer `sk_wkp_*` over `sk_app_*` when you know the installation
3. **Don't log tokens** - Avoid logging full token values
4. **Rotate app tokens periodically** - Regenerate long-lived tokens on a schedule
5. **Use environment variables** - Don't hardcode tokens in source code

## Troubleshooting

### "Skedyul client not configured: missing apiToken"

The SDK couldn't find a token. Ensure either:
- `SKEDYUL_API_TOKEN` environment variable is set
- `configure()` was called at startup
- You're inside a `runWithConfig()` block with a valid token

### "Unauthorized" or 401 errors

- Check that the token hasn't expired (workplace tokens are short-lived)
- Verify the token has the correct scope for the operation
- Ensure the app is still installed in the target workplace

### Token exchange fails

- Verify you're using an app token (`sk_app_*`) to call `token.exchange()`
- Check that the `appInstallationId` is valid and the app is installed
