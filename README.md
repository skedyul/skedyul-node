# skedyul

Reusable helpers for building Model Context Protocol (MCP) runtimes in Node.js. This package powers the dedicated and serverless starters by exposing registry typing, environment helpers, and a shared `server.create` factory that wires JSON-RPC tooling, request counting, and runtime-specific adapters.

## What's inside

- `ToolContext`, `ToolHandler`, and supporting typings so registries can stay strongly typed.
- `server.create` accepts a config object (metadata, compute layer, rate limits, CORS) and a tool registry, then exposes a `listen()` API for HTTP servers and a Lambda-style `handler()` respectively.
- Request counting, TTL, env merging (`MCP_ENV_JSON` + `MCP_ENV`), JSON-RPC transport, and health metadata so each runtime behaves consistently.

## Billing contract

Every `ToolHandler` must return both its result payload (`output`) and a `billing` object describing the credits consumed:

```ts
export const helloWorld: ToolHandler<HelloWorldInput, HelloWorldOutput> = async ({
  input,
  context,
}) => {
  // Do your work here...
  const credits = calculateCredits(input, context) // e.g. characters × rate

  return {
    output: {
      message: `Hello, ${input.name ?? 'world'}`,
      environmentName: context.env.SKEDYUL_ENV ?? 'local',
    },
    billing: { credits },
  }
}
```

Servers attach that `billing` data to every MCP response, so callers always know the final credit cost. Since pricing may depend on runtime data (like message length), compute credits inside the registry or another secure helper that can read your pricing tables, rather than in the shared server logic.

## Estimate endpoint

Both transports expose a dedicated `POST /estimate` endpoint that reuses the same registry to calculate projected billing without executing charged work. Callers supply a tool name and inputs, and the server forwards the request to the registry with `context.mode === 'estimate'`. The response contains only the `billing` block:

```json
POST /estimate
{
  "name": "hello-world",
  "inputs": { "name": "demo" }
}

200 OK
{
  "billing": { "credits": 4 }
}
```

Treat `/estimate` as an authentication-protected route (if your runtime supports auth) because it exposes pricing metadata. Keep your pricing tables and cost calculations in a guarded part of your stack, and never return internal secrets through `estimate`.

## Core API hooks

For integration-specific RPCs that belong to your platform rather than a tool, provide a `coreApi` implementation when calling `server.create`. The property accepts:

- `service`: an object implementing `createCommunicationChannel`, `updateCommunicationChannel`, `deleteCommunicationChannel`, `getCommunicationChannel`, `getCommunicationChannels`, and `sendMessage`.
- `webhookHandler`: an optional `(request: WebhookRequest) => Promise<WebhookResponse>` callback that will receive forwarded HTTP webhooks.

The MCP server exposes `POST /core` (with `{ method, params }`) and `POST /core/webhook` for these operations. They never appear under `tools/list` unlesstaken explicit MCP tooling—they are separate transport-level handlers and do not count against tool request limits. Make sure your service returns the structured channel/message data defined in `src/core/types.ts` so the responses stay consistent, and guard `/core`/`/core/webhook` with your platform’s preferred authentication if you surface them externally.

## Core API Client

The SDK includes a client for the Skedyul Core API that enables lookups across workplaces. This is especially useful in webhook handlers where you need to identify which workspace a request belongs to.

### Configuration

Configure the client using environment variables or programmatically:

**Environment Variables:**

```bash
# Base URL for the Skedyul Core API
SKEDYUL_API_URL=https://app.skedyul.com/api

# Your API token (App API or Workplace API)
SKEDYUL_API_TOKEN=sk_app_xxxxx
```

**Programmatic Configuration:**

```ts
import { configure } from 'skedyul'

configure({
  baseUrl: 'https://app.skedyul.com/api',
  apiToken: 'sk_app_xxxxx',
})
```

### Token Types

- **App API Token (`sk_app_*`)**: Grants access to all workplaces where your app is installed. Use this for webhooks where you need to look up resources across workplaces.
- **Workplace API Token (`sk_wkp_*`)**: Scoped to a single workplace. Use this when you know the target workspace (e.g., MCP tools).

### Available Methods

- `workplace.list({ filter?, limit? })` - List workplaces
- `workplace.get(id)` - Get a single workplace
- `communicationChannel.list({ filter?, limit? })` - List communication channels
- `communicationChannel.get(id)` - Get a single channel

### Example: Webhook Handler

```ts
import { communicationChannel, configure } from 'skedyul'

// Configure once at startup (or use env vars)
configure({
  baseUrl: process.env.SKEDYUL_API_URL,
  apiToken: process.env.SKEDYUL_API_TOKEN,
})

// In your webhook handler
async function handleIncomingMessage(phoneNumber: string) {
  // Find the channel across all workplaces where your app is installed
  const channels = await communicationChannel.list({
    filter: { identifierValue: phoneNumber },
    limit: 1,
  })

  if (channels.length === 0) {
    throw new Error('No channel found for this phone number')
  }

  const channel = channels[0]
  console.log(`Found channel in workplace: ${channel.workplaceId}`)

  // Now you can process the message in the correct workspace context
  return channel
}
```

Use these helpers for internal wiring—like pulling the correct workplace for a webhook—without touching the MCP tooling surface directly.

## Installation

```bash
npm install skedyul
```

## Usage

### Define your registry

Each tool should follow the shared handler signature:

```ts
import type { ToolContext, ToolHandler } from 'skedyul'

export interface HelloWorldInput {
  name?: string
}

export interface HelloWorldOutput {
  message: string
  environmentName: string
}

export const helloWorld: ToolHandler<HelloWorldInput, HelloWorldOutput> = async ({
  input,
  context,
}) => {
  const name = input.name?.trim() || 'world'
  const environmentName = context.env.SKEDYUL_ENV ?? 'local'

  return {
    message: `Hello, ${name}!`,
    environmentName,
  }
}

export const registry = {
  'hello-world': helloWorld,
}
```

### Dedicated server

```ts
import { server } from 'skedyul'
import { registry } from './registry'

const mcpServer = server.create(
  {
    computeLayer: 'dedicated',
    metadata: {
      name: 'my-dedicated-server',
      version: '1.0.0',
    },
    defaultPort: 3000,
    maxRequests: 1000,
    ttlExtendSeconds: 3600,
  },
  registry,
)

await mcpServer.listen()
```

### Serverless handler

```ts
import { server } from 'skedyul'
import { registry } from './registry'

const mcpServer = server.create(
  {
    computeLayer: 'serverless',
    metadata: {
      name: 'my-serverless-mcp',
      version: '1.0.0',
    },
    cors: {
      allowOrigin: '*',
    },
  },
  registry,
)

export const handler = mcpServer.handler
```

## Configuration guide

- **`computeLayer`**: Choose `dedicated` to expose an HTTP server (`listen`) or `serverless` to get a Lambda handler (`handler`).
- **`metadata`**: Used for the MCP server versioning payload.
- **`maxRequests` / `ttlExtendSeconds`**: Control request capping logic that triggers a graceful shutdown (dedicated) or throttles health stats.
- **`cors`**: Serverless handlers automatically add the configured CORS headers to every response.
- **Runtime env overrides**: `MCP_ENV_JSON` (build-time) and `MCP_ENV` (container runtime) merge into `process.env` before every request, while request-level `env` arguments temporarily override env vars per tool call.

## Health metadata

Both adapters expose `getHealthStatus()`, returning:

- `status`: always `running` while the process is alive.
- `requests`, `maxRequests`, `requestsRemaining`.
- `lastRequestTime`, `ttlExtendSeconds`.
- `runtime`: string label (`dedicated` or `serverless`).
- `tools`: list of registered tool names.

---

# Skedyul CLI

The Skedyul CLI (`skedyul`) is a powerful command-line interface for developing, testing, and debugging Skedyul integration apps locally.

## Quick Start

```bash
# 1. Authenticate with Skedyul
skedyul auth login

# 2. Navigate to your app directory
cd packages/skedyul-integrations/integrations/my-app

# 3. Link to a workplace
skedyul dev link --workplace my-clinic

# 4. Start the local development server
skedyul dev serve --workplace my-clinic
```

That's it! The CLI will:
- Prompt for any missing environment variables (API keys, credentials)
- Start an ngrok tunnel automatically
- Register your local machine with Skedyul
- Route tool calls from Skedyul to your local server

## Installation

The CLI is included with the `skedyul` package:

```bash
npm install skedyul
# or
pnpm add skedyul
```

Run commands with `npx skedyul` or install globally:

```bash
npm link  # In the skedyul-node package directory
skedyul --help
```

## Commands

### Authentication

```bash
# Log in via browser OAuth
skedyul auth login

# Check authentication status
skedyul auth status

# Log out
skedyul auth logout
```

### Configuration

```bash
# Set global configuration
skedyul config set <key> <value>

# Get a config value
skedyul config get <key>

# List all configuration
skedyul config list
```

**Available config keys:**

| Key | Description | Default |
|-----|-------------|---------|
| `defaultServer` | Skedyul server URL | `https://admin.skedyul.it` |
| `ngrokAuthtoken` | Your ngrok authtoken for tunneling | - |

### Development Commands

#### `skedyul dev link`

Links your local app to a Skedyul workplace. This creates a personal `local-{username}` AppVersion for testing.

```bash
skedyul dev link --workplace <subdomain>

# Example
skedyul dev link --workplace demo-clinic
```

**What it does:**
- Creates (or finds) a `local-{username}` AppVersion in the target workplace
- Creates an AppInstallation for your app in that workplace
- Saves link configuration to `.skedyul/links/{subdomain}.json`

#### `skedyul dev unlink`

Removes a workplace link.

```bash
skedyul dev unlink --workplace <subdomain>
```

#### `skedyul dev serve`

Starts a local MCP server for testing your tools.

```bash
# Standalone mode (no Skedyul connection)
skedyul dev serve

# Connected to Skedyul (sidecar mode)
skedyul dev serve --workplace <subdomain>
```

**Options:**

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain (enables sidecar mode) |
| `--port, -p` | Port to listen on (default: 60000, auto-increments if busy) |
| `--registry, -r` | Path to registry file (auto-detected) |
| `--no-tunnel` | Don't start ngrok tunnel |
| `--tunnel-url` | Use existing tunnel URL |
| `--env, -e` | Set environment variable (e.g., `--env KEY=VALUE`) |
| `--env-file` | Load env vars from file |

**Sidecar Mode:**

When you specify `--workplace`, the CLI:
1. Loads your link configuration
2. Prompts for any missing required environment variables
3. Starts an ngrok tunnel (or uses `--tunnel-url`)
4. Registers the tunnel URL with Skedyul
5. Sends heartbeats to keep the connection alive
6. Routes incoming tool calls to your local server

```bash
# Full example with custom port
skedyul dev serve --workplace demo-clinic --port 8080

# Use existing ngrok tunnel
skedyul dev serve --workplace demo-clinic --tunnel-url https://abc123.ngrok.io
```

#### `skedyul dev invoke`

Invoke a single tool for quick testing.

```bash
skedyul dev invoke <tool-name> [options]

# Examples
skedyul dev invoke appointment_types_list
skedyul dev invoke clients_search --args '{"phone": "+1234567890"}'

# With linked credentials
skedyul dev invoke appointment_types_list --workplace demo-clinic
```

#### `skedyul dev tools`

List all tools in your registry.

```bash
skedyul dev tools
skedyul dev tools --registry ./dist/registry.js
```

#### `skedyul dev validate`

Validate your `skedyul.config.ts` file.

```bash
skedyul dev validate
```

#### `skedyul dev diff`

Preview what would change on deploy.

```bash
skedyul dev diff
```

## Configuration Files

The CLI uses several configuration files:

| File | Purpose |
|------|---------|
| `~/.skedyul/credentials.json` | Authentication tokens |
| `~/.skedyul/config.json` | Global configuration (server URL, ngrok token) |
| `.skedyul.local.json` | Local project overrides (e.g., local server URL) |
| `.skedyul/links/{workplace}.json` | Per-workplace link configuration |
| `.skedyul/env/{workplace}.env` | Per-workplace environment variables |

### Local Development Override

To use a local Skedyul server during development, create `.skedyul.local.json` in your project root:

```json
{
  "serverUrl": "http://localhost:3000"
}
```

## Environment Variables

### Install Configuration

Define required environment variables in your app's `config/install.config.ts`:

```typescript
import type { InstallConfig } from 'skedyul'

const config: InstallConfig = {
  env: {
    API_KEY: {
      label: 'API Key',
      required: true,
      visibility: 'encrypted',
      description: 'Your API key for authentication',
    },
    BASE_URL: {
      label: 'Server URL',
      required: true,
      visibility: 'visible',
      placeholder: 'https://api.example.com',
      description: 'Base URL for the API',
    },
  },
}

export default config
```

The CLI will automatically prompt for these when you run `skedyul dev serve --workplace <name>` if they're not already configured.

### Visibility Options

| Visibility | Behavior |
|------------|----------|
| `visible` | Shown in plain text |
| `encrypted` | Hidden during input, masked in output |

## Ngrok Integration

The CLI uses ngrok to create public tunnels to your local server, allowing Skedyul to route requests to your machine.

### Setup

1. Get a free authtoken at [ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)
2. The CLI will prompt for it on first use, or set it manually:

```bash
skedyul config set ngrokAuthtoken <your-token>
```

### Session Limits

ngrok's free tier allows 1 simultaneous session. If you see an error:

```
ngrok free tier only allows 1 simultaneous session.
```

**Solutions:**
1. Kill other ngrok sessions: `pkill -f ngrok`
2. Use an existing tunnel: `skedyul dev serve --workplace demo --tunnel-url https://existing.ngrok.io`
3. Upgrade to a paid ngrok plan

## Workflow Example

### Setting Up a New Integration

```bash
# 1. Navigate to your app
cd integrations/my-app

# 2. Authenticate
skedyul auth login

# 3. Link to your test workplace
skedyul dev link --workplace staging-clinic

# 4. Start development server (will prompt for env vars)
skedyul dev serve --workplace staging-clinic

# Server starts...
# ✓ Loaded 12 tools from registry
# ✓ Tunnel active: https://abc123.ngrok.io
# ✓ Registered with Skedyul
# Listening on http://localhost:60000
```

### Testing Individual Tools

```bash
# Quick test without full server
skedyul dev invoke appointment_types_list --workplace staging-clinic

# With arguments
skedyul dev invoke calendar_slots_availability_list \
  --workplace staging-clinic \
  --args '{"calendar_names": ["Room 1"], "dates": ["2024-01-15"]}'
```

## Troubleshooting

### "Not linked to {workplace}"

Run `skedyul dev link --workplace {workplace}` first.

### "Authentication required"

Run `skedyul auth login` to authenticate.

### Port already in use

The CLI auto-increments from port 60000 if busy. Or specify: `--port 8080`

### ngrok authentication failed

Set your authtoken: `skedyul config set ngrokAuthtoken <token>`

### Environment variables not loading

Check that your `config/install.config.ts` exports the env configuration properly. Use `--debug` flag for verbose output.

---

## Development

- `npm run build` compiles the TypeScript sources into `dist/`.
- `npm test` rebuilds the package and runs `tests/server.test.js` against the compiled output.
- `npm run lint` (if added later) should validate formatting/typing.

## Publishing

Before publishing:

1. Run `npm run build`.
2. Verify `dist/index.js` and `.d.ts` exist.
3. Ensure `package.json` metadata (name, version, description, repository, author, license) matches the npm listing.

Use `npm publish --access public` once the package is ready; the `files` array already limits the tarball to `dist/`.

## Contributing

Contributions should:

1. Follow the TypeScript style (strict types, async/await, try/catch).
2. Keep MCP transports lean and share logic in `src/server.ts`.
3. Add unit tests under `tests/` and run them via `npm test`.

Open a PR with a clear summary so the release process can verify `dist/` artifacts before publishing.

