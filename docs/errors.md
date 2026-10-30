# Errors

The Skedyul SDK provides structured error types for consistent error handling across your app. These errors are especially important in lifecycle hooks where they're displayed to users during installation.

## Error Types

### InstallError (Base Class)

The base class for all installation-related errors. Extend this for custom error types.

```ts
import { InstallError } from 'skedyul'

class CustomInstallError extends InstallError {
  constructor(message: string) {
    super('CUSTOM_ERROR', message)
  }
}
```

### MissingRequiredFieldError

Thrown when a required environment variable is not provided.

```ts
import { MissingRequiredFieldError } from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  if (!ctx.env.API_KEY) {
    throw new MissingRequiredFieldError('API_KEY')
  }
  // ...
}
```

**Display**: Shows an inline error on the specific field in the installation form.

### AuthenticationError

Thrown when credentials are invalid or authentication fails.

```ts
import { AuthenticationError } from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  try {
    await verifyCredentials(ctx.env.API_KEY)
  } catch (error) {
    throw new AuthenticationError('Invalid API key. Please check your credentials.')
  }
  // ...
}
```

**Display**: Shows a general error message at the top of the form.

### InvalidConfigurationError

Thrown when a configuration value has an invalid format or value.

```ts
import { InvalidConfigurationError } from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  if (ctx.env.API_URL && !isValidUrl(ctx.env.API_URL)) {
    throw new InvalidConfigurationError('API_URL', 'Must be a valid URL starting with https://')
  }
  // ...
}
```

**Display**: Shows an inline error on the specific field with the custom message.

### ConnectionError

Thrown when the app cannot connect to an external service.

```ts
import { ConnectionError } from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  try {
    await testConnection(ctx.env.API_URL)
  } catch (error) {
    throw new ConnectionError('Cannot connect to the API server. Please check the URL and try again.')
  }
  // ...
}
```

**Display**: Shows a general error message at the top of the form.

### AppAuthInvalidError

A special error that signals the user needs to re-authorize the app. Use this when OAuth tokens have expired or been revoked.

```ts
import { AppAuthInvalidError } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  try {
    const response = await callExternalApi(context.env.ACCESS_TOKEN)
    // ...
  } catch (error) {
    if (error.status === 401) {
      throw new AppAuthInvalidError('Your authorization has expired. Please reconnect the app.')
    }
    throw error
  }
}
```

**Behavior**: Triggers the re-authorization flow, redirecting the user to reconnect the app.

---

## Error Interface

All install errors follow this interface:

```ts
interface InstallError {
  code: string      // Error code for programmatic handling
  message: string   // Human-readable error message
  field?: string    // Optional: specific field that caused the error
}
```

### Error Codes

| Error Type | Code | Has Field |
|------------|------|-----------|
| `MissingRequiredFieldError` | `MISSING_REQUIRED_FIELD` | Yes |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | No |
| `InvalidConfigurationError` | `INVALID_CONFIGURATION` | Yes |
| `ConnectionError` | `CONNECTION_ERROR` | No |
| `AppAuthInvalidError` | `APP_AUTH_INVALID` | No |
| `TokenRefreshRequiredError` | `TOKEN_REFRESH_REQUIRED` | No |

---

## Usage in Lifecycle Hooks

### Install Handler

```ts
import type { InstallHandler } from 'skedyul'
import {
  MissingRequiredFieldError,
  AuthenticationError,
  InvalidConfigurationError,
  ConnectionError,
} from 'skedyul'

const installHandler: InstallHandler = async (ctx) => {
  const { API_KEY, API_URL, WORKSPACE_ID } = ctx.env

  // 1. Check required fields
  if (!API_KEY) {
    throw new MissingRequiredFieldError('API_KEY')
  }
  if (!WORKSPACE_ID) {
    throw new MissingRequiredFieldError('WORKSPACE_ID')
  }

  // 2. Validate formats
  if (API_URL && !API_URL.startsWith('https://')) {
    throw new InvalidConfigurationError('API_URL', 'URL must use HTTPS')
  }

  if (WORKSPACE_ID && !/^ws_[a-z0-9]+$/.test(WORKSPACE_ID)) {
    throw new InvalidConfigurationError('WORKSPACE_ID', 'Invalid workspace ID format')
  }

  // 3. Test authentication
  const client = createApiClient(API_KEY, API_URL)
  
  try {
    await client.verifyCredentials()
  } catch (error) {
    if (error.status === 401) {
      throw new AuthenticationError('Invalid API key')
    }
    if (error.status === 403) {
      throw new AuthenticationError('API key does not have required permissions')
    }
    throw new ConnectionError(`Cannot connect to API: ${error.message}`)
  }

  // 4. Verify workspace access
  try {
    await client.getWorkspace(WORKSPACE_ID)
  } catch (error) {
    if (error.status === 404) {
      throw new InvalidConfigurationError('WORKSPACE_ID', 'Workspace not found')
    }
    throw error
  }

  return {}
}
```

### OAuth Callback Handler

```ts
import type { OAuthCallbackHandler } from 'skedyul'
import { AuthenticationError } from 'skedyul'

const oauthCallbackHandler: OAuthCallbackHandler = async (ctx) => {
  const { code, error, error_description } = ctx.request.query

  // Handle OAuth errors
  if (error) {
    if (error === 'access_denied') {
      throw new AuthenticationError('Authorization was denied. Please try again.')
    }
    throw new AuthenticationError(error_description || 'OAuth authorization failed')
  }

  if (!code) {
    throw new AuthenticationError('No authorization code received')
  }

  // Exchange code for tokens
  try {
    const tokens = await exchangeCodeForTokens(code)
    return {
      appInstallationId: decodeState(ctx.request.query.state).appInstallationId,
      env: {
        ACCESS_TOKEN: tokens.access_token,
        REFRESH_TOKEN: tokens.refresh_token,
      },
    }
  } catch (error) {
    throw new AuthenticationError('Failed to complete authorization. Please try again.')
  }
}
```

---

## Usage in Tool Handlers

### Handling Expired Tokens

```ts
import { AppAuthInvalidError } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  try {
    const response = await fetch('https://api.external.com/data', {
      headers: { 'Authorization': `Bearer ${context.env.ACCESS_TOKEN}` },
    })

    if (response.status === 401) {
      // Token expired - trigger re-authorization
      throw new AppAuthInvalidError('Session expired. Please reconnect the app.')
    }

    const data = await response.json()
    return {
      output: data,
      billing: { credits: 1 },
      meta: { success: true, message: 'Data retrieved', toolName: 'get_data' },
    }
  } catch (error) {
    if (error instanceof AppAuthInvalidError) {
      throw error  // Re-throw to trigger re-auth flow
    }
    
    return {
      output: null,
      billing: { credits: 0 },
      meta: { success: false, message: error.message, toolName: 'get_data' },
      error: { code: 'API_ERROR', message: error.message },
    }
  }
}
```

### Token Refresh Pattern

Do not refresh an access token inside a tool, batch operation, or webhook. Return `TOKEN_REFRESH_REQUIRED`. The platform runs the `refresh_token` hook once for that installation, persists the returned env, and retries the original call. A second `TOKEN_REFRESH_REQUIRED` on that retry, or `AppAuthInvalidError` from the hook (`invalid_grant`), marks the installation auth invalid.

```ts
import {
  TokenRefreshRequiredError,
  createTokenRefreshRequired,
  AppAuthInvalidError,
} from 'skedyul'

const ACCESS_TOKEN_KEY = 'ACCESS_TOKEN'

function assertAccessTokenFresh(env: Record<string, string | undefined>) {
  const expiry = env.TOKEN_EXPIRY ? Date.parse(env.TOKEN_EXPIRY) : NaN
  const missing = !env.ACCESS_TOKEN
  const expiring = Number.isFinite(expiry) && expiry - Date.now() < 60_000
  if (missing || expiring) {
    throw new TokenRefreshRequiredError('Access token expired', {
      tokenKey: ACCESS_TOKEN_KEY,
    })
  }
}

// Or return the same code without throwing:
return createTokenRefreshRequired('Access token expired', {
  tokenKey: ACCESS_TOKEN_KEY,
})
```

Tool result:

```json
{
  "success": false,
  "output": null,
  "error": {
    "code": "TOKEN_REFRESH_REQUIRED",
    "message": "Access token expired",
    "category": "auth",
    "details": { "tokenKey": "ACCESS_TOKEN" }
  }
}
```

`tokenKey` is the install env key that holds the stale access token. The platform uses it to skip a refresh that another caller already finished. The `refresh_token` hook returns only the env to persist (see [Lifecycle hooks](./lifecycle-hooks.md)). Throw `AppAuthInvalidError` from that hook when the provider rejects the refresh token. Do not throw `AppAuthInvalidError` for an expired access token that can still be refreshed.

---

## Error Display

### Field-Level Errors

Errors with a `field` property are displayed inline next to the corresponding form field:

```
┌─────────────────────────────────────┐
│ API Key                             │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ ⚠️ This field is required           │
└─────────────────────────────────────┘
```

### General Errors

Errors without a `field` property are displayed at the top of the form:

```
┌─────────────────────────────────────┐
│ ❌ Invalid API key. Please check    │
│    your credentials and try again.  │
└─────────────────────────────────────┘
```

---

## Custom Error Types

Create custom error types for app-specific scenarios:

```ts
import { InstallError } from 'skedyul'

// Custom error for subscription issues
export class SubscriptionError extends InstallError {
  constructor(message: string) {
    super('SUBSCRIPTION_ERROR', message)
  }
}

// Custom error for rate limiting
export class RateLimitError extends InstallError {
  constructor(retryAfter?: number) {
    super(
      'RATE_LIMIT_ERROR',
      retryAfter
        ? `Rate limited. Please try again in ${retryAfter} seconds.`
        : 'Rate limited. Please try again later.',
    )
  }
}

// Usage
const installHandler: InstallHandler = async (ctx) => {
  const subscription = await checkSubscription(ctx.env.API_KEY)
  
  if (!subscription.active) {
    throw new SubscriptionError('Your subscription has expired. Please renew to continue.')
  }
  
  if (subscription.plan === 'free' && !subscription.hasApiAccess) {
    throw new SubscriptionError('API access requires a paid plan. Please upgrade.')
  }
  
  return {}
}
```

---

## Best Practices

### 1. Be Specific

Provide actionable error messages:

```ts
// Good
throw new AuthenticationError('Invalid API key. Find your key at Settings > API in your dashboard.')

// Bad
throw new AuthenticationError('Authentication failed')
```

### 2. Validate Early

Check required fields before making API calls:

```ts
// Good - fail fast
if (!ctx.env.API_KEY) {
  throw new MissingRequiredFieldError('API_KEY')
}
if (!ctx.env.WORKSPACE_ID) {
  throw new MissingRequiredFieldError('WORKSPACE_ID')
}
// Then make API calls...

// Bad - API call fails with confusing error
const client = createClient(ctx.env.API_KEY)  // undefined API_KEY
await client.getWorkspace(ctx.env.WORKSPACE_ID)  // Fails with "Invalid request"
```

### 3. Handle All Error Cases

```ts
try {
  await externalApi.verify(credentials)
} catch (error) {
  if (error.status === 401) {
    throw new AuthenticationError('Invalid credentials')
  }
  if (error.status === 403) {
    throw new AuthenticationError('Insufficient permissions')
  }
  if (error.status === 404) {
    throw new InvalidConfigurationError('WORKSPACE_ID', 'Workspace not found')
  }
  if (error.code === 'ECONNREFUSED') {
    throw new ConnectionError('Cannot connect to server')
  }
  // Re-throw unknown errors
  throw error
}
```

### 4. Use AppAuthInvalidError Appropriately

Only throw `AppAuthInvalidError` when re-authorization is actually needed:

```ts
// Good - token is definitely invalid
if (response.status === 401) {
  throw new AppAuthInvalidError('Please reconnect the app')
}

// Bad - might be a temporary issue
if (response.status >= 500) {
  throw new AppAuthInvalidError('Server error')  // Don't do this!
}
```
