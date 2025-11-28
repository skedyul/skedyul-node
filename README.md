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

## Higher-level helpers

While `server.create` hosts the MCP surface, `skedyul.workplace` and `skedyul.communicationChannel` expose dedicated helpers that talk to `/core` for the same workplace and channel metadata. Each helper returns the typed objects defined in `src/core/types.ts` so integrations can look up a channel/workplace pair before acting on an incoming webhook without manually composing the RPC payload or dealing with authentication.

The helpers currently provide:

- `workplace.list(filter?: Record<string, unknown>)`
- `workplace.get(id: string)`
- `communicationChannel.list(filter?: Record<string, unknown>)`
- `communicationChannel.get(id: string)`

Example:

```ts
import { communicationChannel, workplace } from 'skedyul'

const [channel] = await communicationChannel.list({
  filter: { identifierValue: '+15551234567' },
})

const owner = await workplace.get(channel.workplaceId)
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

