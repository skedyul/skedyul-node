# skedyul

The official Node.js SDK for building Skedyul integration apps. This package provides everything you need to create MCP (Model Context Protocol) servers, handle webhooks, manage lifecycle events, and interact with the Skedyul platform.

## Version 1.0.0

This release introduces a modular, file-based configuration system with improved type safety and developer experience.

## Features

- **MCP Server**: Build tools that AI agents can invoke via the Model Context Protocol
- **Webhooks**: Receive and process external events (SMS, emails, API callbacks)
- **Lifecycle Hooks**: Handle app installation, provisioning, and cleanup
- **Core API Client**: Interact with Skedyul resources (workplaces, channels, instances)
- **CLI**: Develop and test locally with hot-reload and tunneling
- **Modular Config**: File-based configuration with auto-discovery patterns

## Installation

```bash
npm install skedyul
# or
pnpm add skedyul
```

## Quick Start

### 1. Create your configuration

```ts
// skedyul.config.ts
import { defineConfig } from 'skedyul'
import pkg from './package.json'

export default defineConfig({
  name: 'My Integration',
  version: pkg.version,
  description: 'Description of what this app does',
  computeLayer: 'serverless',

  tools: import('./src/registries'),
  webhooks: import('./src/registries'),
  provision: import('./provision'),
})
```

### 2. Define your provision config

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
}

export default config
```

### 3. Define a model

```ts
// crm/models/contact.ts
import { defineModel } from 'skedyul'

export default defineModel({
  handle: 'contact',
  label: 'Contact',
  labelPlural: 'Contacts',
  scope: 'shared',

  fields: [
    {
      handle: 'name',
      label: 'Name',
      type: 'string',
      required: true,
      owner: 'workplace',
    },
    {
      handle: 'email',
      label: 'Email',
      type: 'string',
      required: false,
      owner: 'workplace',
    },
  ],
})
```

### 4. Define a tool

```ts
// src/tools/hello.ts
import { z } from 'skedyul'
import type { ToolHandler, ToolDefinition } from 'skedyul'

const inputSchema = z.object({
  name: z.string().optional(),
})

type Input = z.infer<typeof inputSchema>
type Output = { message: string }

const handler: ToolHandler<Input, Output> = async (input, context) => {
  return {
    output: { message: `Hello, ${input.name ?? 'world'}!` },
    billing: { credits: 1 },
    meta: { success: true, message: 'Greeting sent', toolName: 'hello' },
  }
}

export const helloTool: ToolDefinition<Input, Output> = {
  name: 'hello',
  description: 'Say hello to someone',
  inputSchema,
  handler,
}
```

### 5. Start the server

```ts
// src/server.ts
import { server } from 'skedyul'
import { toolRegistry } from './tools/registry'

const mcpServer = server.create(
  {
    computeLayer: 'dedicated',
    metadata: { name: 'my-integration', version: '1.0.0' },
  },
  toolRegistry,
)

await mcpServer.listen(3000)
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Authentication](./docs/authentication.md) | Token types, scopes, and configuration |
| [Tools](./docs/tools.md) | Building MCP tools with handlers and schemas |
| [Webhooks](./docs/webhooks.md) | Receiving external events and callbacks |
| [Lifecycle Hooks](./docs/lifecycle-hooks.md) | Install, provision, and uninstall handlers |
| [Core API](./docs/core-api.md) | Client for Skedyul platform resources |
| [Configuration](./docs/configuration.md) | skedyul.config.ts reference |
| [Errors](./docs/errors.md) | Error types and handling patterns |

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
│       └── contact.ts
├── channels/
│   ├── index.ts
│   └── phone.ts
├── pages/
│   ├── index.ts
│   ├── navigation.ts          # Root navigation
│   └── settings/
│       └── page.ts
└── src/
    └── registries.ts          # Tools and webhooks
```

## Server Modes

### Dedicated (Docker/ECS)

Long-running HTTP server with request counting and graceful shutdown:

```ts
const mcpServer = server.create(
  {
    computeLayer: 'dedicated',
    metadata: { name: 'my-app', version: '1.0.0' },
    defaultPort: 3000,
    maxRequests: 1000,
    ttlExtendSeconds: 3600,
  },
  toolRegistry,
  webhookRegistry,
)

await mcpServer.listen()
```

### Serverless (AWS Lambda)

Export a Lambda handler with automatic CORS:

```ts
const mcpServer = server.create(
  {
    computeLayer: 'serverless',
    metadata: { name: 'my-app', version: '1.0.0' },
    cors: { allowOrigin: '*' },
  },
  toolRegistry,
  webhookRegistry,
)

export const handler = mcpServer.handler
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC (tools/list, tools/call) |
| `/webhooks/{name}` | * | Webhook handlers |
| `/health` | GET | Server health status |
| `/estimate` | POST | Billing estimation |
| `/install` | POST | Installation handler |
| `/provision` | POST | Provisioning handler |
| `/uninstall` | POST | Uninstall handler |
| `/oauth_callback` | POST | OAuth callback handler |

---

# Skedyul CLI

The CLI provides local development tools for building and testing Skedyul apps.

## Quick Start

```bash
# 1. Authenticate with Skedyul
skedyul auth login

# 2. Navigate to your app directory
cd integrations/my-app

# 3. Link to a workplace
skedyul dev link --workplace my-clinic

# 4. Start the local development server
skedyul dev serve --workplace my-clinic
```

The CLI will:
- Prompt for any missing environment variables
- Start an ngrok tunnel automatically
- Register your local machine with Skedyul
- Route tool calls to your local server

## Commands

### Authentication

```bash
skedyul auth login     # Log in via browser OAuth
skedyul auth status    # Check authentication status
skedyul auth logout    # Log out
```

### Configuration

```bash
skedyul config set <key> <value>  # Set global configuration
skedyul config get <key>          # Get a config value
skedyul config list               # List all configuration
```

| Key | Description | Default |
|-----|-------------|---------|
| `defaultServer` | Skedyul server URL | `https://admin.skedyul.it` |
| `ngrokAuthtoken` | Your ngrok authtoken | - |

### Development

```bash
skedyul dev link --workplace <subdomain>    # Link to a workplace
skedyul dev unlink --workplace <subdomain>  # Remove a link
skedyul dev serve --workplace <subdomain>   # Start dev server
skedyul dev invoke <tool-name>              # Test a single tool
skedyul dev tools                           # List all tools
skedyul dev validate                        # Validate config
skedyul dev diff                            # Preview deploy changes
```

### Serve Options

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain (enables sidecar mode) |
| `--port, -p` | Port to listen on (default: 60000) |
| `--registry, -r` | Path to registry file |
| `--no-tunnel` | Don't start ngrok tunnel |
| `--tunnel-url` | Use existing tunnel URL |
| `--env, -e` | Set environment variable |
| `--env-file` | Load env vars from file |

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.skedyul/credentials.json` | Authentication tokens |
| `~/.skedyul/config.json` | Global configuration |
| `.skedyul.local.json` | Local project overrides |
| `.skedyul/links/{workplace}.json` | Per-workplace link config |
| `.skedyul/env/{workplace}.env` | Per-workplace env vars |

## Ngrok Setup

1. Get a free authtoken at [ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)
2. Set it: `skedyul config set ngrokAuthtoken <your-token>`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not linked to {workplace}" | Run `skedyul dev link --workplace {workplace}` |
| "Authentication required" | Run `skedyul auth login` |
| Port already in use | Use `--port 8080` or let CLI auto-increment |
| ngrok auth failed | Run `skedyul config set ngrokAuthtoken <token>` |

---

## Development

```bash
npm run build   # Compile TypeScript
npm test        # Run tests
```

## Contributing

1. Follow TypeScript style (strict types, async/await)
2. Keep MCP transports lean
3. Add unit tests under `tests/`

Open a PR with a clear summary for review.
