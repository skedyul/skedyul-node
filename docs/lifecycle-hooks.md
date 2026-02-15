# Lifecycle Hooks

Lifecycle hooks allow your app to execute code at key moments: when users install your app, when a new version is deployed, and when the app is uninstalled. These hooks are essential for setting up external resources, validating credentials, and cleaning up.

## Overview

| Hook | When Called | Purpose |
|------|-------------|---------|
| `install` | User installs app | Validate credentials, setup per-installation resources |
| `oauth_callback` | OAuth provider redirects | Exchange auth code for tokens |
| `provision` | App version deployed | Setup version-level resources |
| `uninstall` | User uninstalls app | Cleanup external resources |

## Defining Hooks

Hooks are defined in your server configuration:

```ts
import { server } from 'skedyul'
import { toolRegistry } from './tools/registry'
import { webhookRegistry } from './webhooks/registry'

const mcpServer = server.create(
  {
    computeLayer: 'serverless',
    metadata: { name: 'my-app', version: '1.0.0' },
    hooks: {
      install: installHandler,
      oauth_callback: oauthCallbackHandler,  // Required if using OAuth
      provision: provisionHandler,
      uninstall: uninstallHandler,
    },
  },
  toolRegistry,
  webhookRegistry,
)
```

### With Timeouts

You can specify custom timeouts for long-running hooks:

```ts
hooks: {
  install: {
    handler: installHandler,
    timeout: 60000,  // 1 minute (default)
  },
  provision: {
    handler: provisionHandler,
    timeout: 300000,  // 5 minutes (default)
  },
  uninstall: {
    handler: uninstallHandler,
    timeout: 60000,  // 1 minute (default)
  },
}
```

---

## Install Handler

Called when a user installs your app in their workplace. Use this to validate credentials and set up per-installation resources.

### Handler Signature

```ts
type InstallHandler = (ctx: InstallHandlerContext) => Promise<InstallHandlerResult>

interface InstallHandlerContext {
  env: Record<string, string>  // User-provided env vars
  workplace: { id: string; subdomain: string }
  appInstallationId: string
  app: { 
    id: string
    versionId: string
    handle: string
    versionHandle: string 
  }
}

interface InstallHandlerResult {
  env?: Record<string, string>  // Modified/additional env vars to store
  redirect?: string             // URL to redirect user (required for OAuth)
}
```

### Basic Example

```ts
import type { InstallHandler } from 'skedyul'
import { AuthenticationError, InvalidConfigurationError } from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  const { API_KEY, API_URL } = ctx.env

  // Validate required fields
  if (!API_KEY) {
    throw new MissingRequiredFieldError('API_KEY')
  }

  // Validate URL format
  if (API_URL && !isValidUrl(API_URL)) {
    throw new InvalidConfigurationError('API_URL', 'Invalid URL format')
  }

  // Test credentials
  try {
    const client = createApiClient(API_KEY, API_URL)
    await client.verifyCredentials()
  } catch (error) {
    throw new AuthenticationError('Invalid API credentials')
  }

  // Optionally normalize/transform env vars
  return {
    env: {
      API_URL: API_URL || 'https://api.default.com',
    },
  }
}
```

### OAuth Flow Example

When your app uses OAuth, the install handler must return a redirect URL:

```ts
import type { InstallHandler, ServerHooksWithOAuth } from 'skedyul'

const installHandler: InstallHandler<ServerHooksWithOAuth> = async (ctx) => {
  // Build OAuth authorization URL
  const state = Buffer.from(JSON.stringify({
    appInstallationId: ctx.appInstallationId,
    workplaceId: ctx.workplace.id,
  })).toString('base64')

  const authUrl = new URL('https://provider.com/oauth/authorize')
  authUrl.searchParams.set('client_id', ctx.env.OAUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', `${process.env.SKEDYUL_API_URL}/oauth/callback/${ctx.app.handle}`)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'read write')

  // Redirect is REQUIRED when oauth_callback hook exists
  return {
    redirect: authUrl.toString(),
  }
}
```

---

## OAuth Callback Handler

Called when the OAuth provider redirects back after user authorization. Use this to exchange the authorization code for access tokens.

### Handler Signature

```ts
type OAuthCallbackHandler = (ctx: OAuthCallbackContext) => Promise<OAuthCallbackResult>

interface OAuthCallbackContext {
  request: WebhookRequest  // Full HTTP request from OAuth provider
}

interface OAuthCallbackResult {
  env?: Record<string, string>  // Tokens to store (e.g., access_token)
  appInstallationId?: string    // Which installation to complete
}
```

### Example

```ts
import type { OAuthCallbackHandler } from 'skedyul'

const oauthCallbackHandler: OAuthCallbackHandler = async (ctx) => {
  const { code, state } = ctx.request.query

  // Decode state to get installation info
  const { appInstallationId } = JSON.parse(
    Buffer.from(state, 'base64').toString()
  )

  // Exchange code for tokens
  const tokenResponse = await fetch('https://provider.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      redirect_uri: `${process.env.SKEDYUL_API_URL}/oauth/callback/my-app`,
    }),
  })

  const tokens = await tokenResponse.json()

  return {
    appInstallationId,
    env: {
      ACCESS_TOKEN: tokens.access_token,
      REFRESH_TOKEN: tokens.refresh_token,
    },
  }
}
```

### OAuth Hook Relationship

When `oauth_callback` is defined, the `install` handler **must** return a `redirect`:

```ts
// TypeScript enforces this relationship
const hooks: ServerHooksWithOAuth = {
  install: async (ctx) => {
    // redirect is REQUIRED here
    return { redirect: 'https://...' }
  },
  oauth_callback: async (ctx) => {
    return { appInstallationId: '...', env: { ... } }
  },
}
```

---

## Provision Handler

Called when a new version of your app is deployed. Use this for version-level setup that applies to all installations.

### Handler Signature

```ts
type ProvisionHandler = (ctx: ProvisionHandlerContext) => Promise<ProvisionHandlerResult>

interface ProvisionHandlerContext {
  env: Record<string, string>  // Merged process.env + request env
  app: { id: string; versionId: string }
}

interface ProvisionHandlerResult {
  // Currently empty, reserved for future use
}
```

### Example

```ts
import type { ProvisionHandler } from 'skedyul'

const provisionHandler: ProvisionHandler = async (ctx) => {
  console.log(`Provisioning app version: ${ctx.app.versionId}`)

  // Create external resources that are shared across installations
  // For example: register webhooks with external services,
  // create API keys, set up monitoring, etc.

  const { EXTERNAL_API_KEY } = ctx.env

  // Verify external service is accessible
  const response = await fetch('https://external-service.com/health', {
    headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
  })

  if (!response.ok) {
    throw new Error('External service unavailable')
  }

  return {}
}
```

### Provision vs Install

| Aspect | Provision | Install |
|--------|-----------|---------|
| When | App version deployed | User installs app |
| Scope | All installations | Single installation |
| Context | App version only | Workplace + installation |
| Token | `sk_prv_*` | `sk_wkp_*` |
| Use case | Shared resources | Per-user setup |

---

## Uninstall Handler

Called when a user uninstalls your app. Use this to clean up external resources.

### Handler Signature

```ts
type UninstallHandler = (ctx: UninstallHandlerContext) => Promise<UninstallHandlerResult>

interface UninstallHandlerContext {
  env: Record<string, string>
  workplace: { id: string; subdomain: string }
  appInstallationId: string
  app: { 
    id: string
    versionId: string
    handle: string
    versionHandle: string 
  }
}

interface UninstallHandlerResult {
  cleanedWebhookIds?: string[]  // IDs of cleaned up webhooks
}
```

### Example

```ts
import type { UninstallHandler } from 'skedyul'
import { webhook } from 'skedyul'

const uninstallHandler: UninstallHandler = async (ctx) => {
  console.log(`Uninstalling from workplace: ${ctx.workplace.subdomain}`)

  const cleanedWebhookIds: string[] = []

  // Clean up external service registrations
  const { EXTERNAL_API_KEY } = ctx.env

  try {
    // Remove webhooks registered with external service
    const { webhooks } = await webhook.list()
    
    for (const wh of webhooks) {
      // Clean up external service
      await fetch(`https://external-service.com/webhooks/${wh.context?.externalId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
      })
      
      cleanedWebhookIds.push(wh.id)
    }
  } catch (error) {
    console.error('Cleanup error:', error)
    // Continue even if cleanup fails
  }

  return { cleanedWebhookIds }
}
```

### Cleanup Best Practices

1. **Don't throw on cleanup failures** - Log errors but continue
2. **Clean up external resources first** - Before Skedyul resources
3. **Return cleaned webhook IDs** - Helps with debugging
4. **Handle partial failures** - Some resources may already be deleted

---

## Complete Example

Here's a complete example with all lifecycle hooks:

```ts
// src/server/hooks.ts
import type {
  InstallHandler,
  OAuthCallbackHandler,
  ProvisionHandler,
  UninstallHandler,
  ServerHooksWithOAuth,
} from 'skedyul'
import { AuthenticationError, webhook } from 'skedyul'

// Install: Redirect to OAuth
export const installHandler: InstallHandler<ServerHooksWithOAuth> = async (ctx) => {
  const state = Buffer.from(JSON.stringify({
    appInstallationId: ctx.appInstallationId,
  })).toString('base64')

  const authUrl = `https://provider.com/oauth/authorize?` +
    `client_id=${ctx.env.OAUTH_CLIENT_ID}&` +
    `state=${state}&` +
    `redirect_uri=${encodeURIComponent(ctx.env.OAUTH_REDIRECT_URI!)}`

  return { redirect: authUrl }
}

// OAuth Callback: Exchange code for tokens
export const oauthCallbackHandler: OAuthCallbackHandler = async (ctx) => {
  const { code, state } = ctx.request.query
  const { appInstallationId } = JSON.parse(Buffer.from(state, 'base64').toString())

  const response = await fetch('https://provider.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.OAUTH_CLIENT_ID!,
      client_secret: process.env.OAUTH_CLIENT_SECRET!,
    }),
  })

  if (!response.ok) {
    throw new AuthenticationError('Failed to exchange OAuth code')
  }

  const tokens = await response.json()

  return {
    appInstallationId,
    env: {
      ACCESS_TOKEN: tokens.access_token,
      REFRESH_TOKEN: tokens.refresh_token,
      TOKEN_EXPIRES_AT: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
  }
}

// Provision: Version-level setup
export const provisionHandler: ProvisionHandler = async (ctx) => {
  console.log(`Provisioning version ${ctx.app.versionId}`)
  // Setup shared resources...
  return {}
}

// Uninstall: Cleanup
export const uninstallHandler: UninstallHandler = async (ctx) => {
  console.log(`Uninstalling from ${ctx.workplace.subdomain}`)
  
  // Revoke OAuth tokens
  try {
    await fetch('https://provider.com/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: ctx.env.ACCESS_TOKEN,
        client_id: process.env.OAUTH_CLIENT_ID!,
      }),
    })
  } catch (error) {
    console.error('Failed to revoke token:', error)
  }

  return {}
}

// Export hooks configuration
export const hooks: ServerHooksWithOAuth = {
  install: installHandler,
  oauth_callback: oauthCallbackHandler,
  provision: provisionHandler,
  uninstall: uninstallHandler,
}
```

```ts
// src/server/index.ts
import { server } from 'skedyul'
import { toolRegistry } from '../tools/registry'
import { webhookRegistry } from '../webhooks/registry'
import { hooks } from './hooks'

const mcpServer = server.create(
  {
    computeLayer: 'serverless',
    metadata: { name: 'my-oauth-app', version: '1.0.0' },
    hooks,
  },
  toolRegistry,
  webhookRegistry,
)

export const handler = mcpServer.handler
```

---

## Error Handling

Lifecycle hooks can throw typed errors that are displayed to users:

```ts
import {
  MissingRequiredFieldError,
  AuthenticationError,
  InvalidConfigurationError,
  ConnectionError,
} from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  // Missing field - shows inline error on form
  if (!ctx.env.API_KEY) {
    throw new MissingRequiredFieldError('API_KEY')
  }

  // Invalid format - shows inline error
  if (!isValidUrl(ctx.env.API_URL)) {
    throw new InvalidConfigurationError('API_URL', 'Must be a valid URL')
  }

  // Auth failure - shows general error
  try {
    await verifyCredentials(ctx.env.API_KEY)
  } catch {
    throw new AuthenticationError('Invalid API key')
  }

  // Connection failure - shows general error
  try {
    await testConnection(ctx.env.API_URL)
  } catch {
    throw new ConnectionError('Cannot connect to API server')
  }

  return {}
}
```

See [Errors](./errors.md) for more details on error types.
