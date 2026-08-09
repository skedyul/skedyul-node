# Server runtime

The Skedyul server exposes your tools, webhooks, and lifecycle hooks over HTTP. Use `server.create()` from the main `skedyul` package, or import pre-built entry points for each compute layer.

## Creating a server

`server.create()` accepts a resolved `SkedyulConfig` with registries loaded (not dynamic imports):

```ts
import { server } from 'skedyul'
import { toolRegistry } from './registries'
import { webhookRegistry } from './registries'
import { hooks } from './hooks'

const mcpServer = server.create({
  name: 'my-integration',
  version: '1.0.0',
  computeLayer: 'serverless', // or 'dedicated'
  tools: toolRegistry,
  webhooks: webhookRegistry,
  hooks,
  queues: { /* rate-limit config */ },
  cors: { allowOrigin: '*' },
})

// Serverless
export const handler = mcpServer.handler

// Dedicated
await mcpServer.listen(3000)
```

The CLI `skedyul build` command reads `skedyul.config.ts` and produces `dist/server/mcp_server.{js|mjs}` automatically.

## Package entry points

| Import | Build output | Use |
|--------|--------------|-----|
| `skedyul` | `dist/index.js` / `dist/esm/index.mjs` | SDK + `server.create()` |
| `skedyul/serverless` | `dist/serverless/server.mjs` | Lambda handler only |
| `skedyul/dedicated` | `dist/dedicated/server.js` | Long-running HTTP server |

Pre-built entries load config from `.skedyul/config.json` (exported via `skedyul config:export` or written at deploy time).

## Compute layers

| Layer | Hosting | Characteristics |
|-------|---------|-----------------|
| `serverless` | AWS Lambda | Stateless, auto-scaling, `export const handler` |
| `dedicated` | Docker / ECS | Long-running, streaming MCP on `/mcp`, graceful shutdown |

### Serverless

```ts
import { server } from 'skedyul'

const mcpServer = server.create({
  computeLayer: 'serverless',
  name: 'my-app',
  version: '1.0.0',
  tools: toolRegistry,
  maxRequests: 1000,       // Optional: recycle after N requests
  ttlExtendSeconds: 3600,  // Optional: extend Lambda lifetime
  cors: { allowOrigin: '*' },
})

export const handler = mcpServer.handler
```

### Dedicated

```ts
const mcpServer = server.create({
  computeLayer: 'dedicated',
  name: 'my-app',
  version: '1.0.0',
  tools: toolRegistry,
  defaultPort: 3000,
  maxRequests: 1000,
})

await mcpServer.listen() // Uses defaultPort or PORT env
```

Dedicated mode uses the MCP SDK `StreamableHTTPServerTransport` for streaming `tools/call` responses on `POST /mcp`.

## HTTP endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check and request stats |
| `GET` | `/config` | Serialized resolved config |
| `POST` | `/mcp` | MCP JSON-RPC (`tools/list`, `tools/call`, `webhooks/list`) |
| `POST` | `/mcp/batch` | Batch MCP requests |
| `POST` | `/estimate` | Billing estimate without execution |
| `POST` | `/core` | Custom Core API method dispatch |
| `POST` | `/core/webhook` | Core API webhook bridge |
| `POST` | `/install` | Install lifecycle hook |
| `POST` | `/uninstall` | Uninstall lifecycle hook |
| `POST` | `/provision` | Provision lifecycle hook |
| `POST` | `/setup/revalidate` | Setup revalidate lifecycle hook |
| `POST` | `/oauth_callback` | OAuth callback hook |
| `POST` | `/batch-operation` | Batch operation setup/iterate (platform-invoked) |
| `POST` | `/webhooks/{handle}` | Dynamic webhook handler |
| `OPTIONS` | `*` | CORS preflight |

### Batch operation invoke

`POST /batch-operation` is called by the platform (via the compute worker, SigV4-signed for Lambda Function URLs) with the same env/context envelope pattern as tools and lifecycle hooks:

```json
{
  "method": "setup",
  "handle": "import_members",
  "env": {
    "SKEDYUL_API_TOKEN": "sk_wkp_...",
    "SKEDYUL_API_URL": "https://..."
  },
  "context": {
    "workplaceId": "wp_...",
    "appInstallationId": "inst_...",
    "appId": "app_...",
    "app": { "id": "app_...", "versionId": "ver_..." },
    "workplace": { "id": "wp_...", "subdomain": "acme" }
  },
  "invocation": {
    "invocationId": "...",
    "invocationType": "batch_operation",
    "batchOperationHandle": "import_members",
    "batchOperationMethod": "setup"
  },
  "input": {}
}
```

For `method: "iterate"`, also pass `state`, `page` / `cursor`, and `limit`.

Runtime matches tool handlers:

- Env is merged with `buildToolExecutionEnv` (process.env + baked `MCP_ENV` + request env)
- Handlers run inside `runWithConfig` → `runWithRateLimitExecutionContext` → `runWithLogContext`
- `ctx.env` includes provision secrets from the baked executable env (for example upstream API keys)

**Success response:**

```json
{
  "success": true,
  "result": { "state": {}, "total": 100 },
  "billing": { "credits": 0 }
}
```

**Soft failure (HTTP 200, tool-shaped — e.g. rate limits):**

```json
{
  "success": false,
  "error": { "code": "RATE_LIMITED", "message": "...", "category": "external" },
  "retry": { "allowed": true, "afterMs": 5000 },
  "billing": { "credits": 0 }
}
```

Setup/iterate may return domain-only fields (billing defaults to `{ credits: 0 }`) or an explicit `{ success: false, error, retry?, billing? }` failure.

### MCP protocol

`POST /mcp` accepts JSON-RPC 2.0:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "hello",
    "arguments": { "name": "World" }
  }
}
```

### Estimate endpoint

```json
POST /estimate
{
  "name": "send_email",
  "inputs": { "to": "user@example.com" }
}
```

Returns billing credits without executing side effects. Tools should check `context.mode === 'estimate'`.

## Lifecycle hooks

Pass hooks in the server config object (not as separate constructor arguments):

```ts
const mcpServer = server.create({
  name: 'my-app',
  version: '1.0.0',
  computeLayer: 'serverless',
  tools: toolRegistry,
  hooks: {
    install: installHandler,
    provision: provisionHandler,
    uninstall: uninstallHandler,
    oauth_callback: oauthCallbackHandler,
  },
})
```

Custom timeouts:

```ts
hooks: {
  install: { handler: installHandler, timeout: 60_000 },
  provision: { handler: provisionHandler, timeout: 300_000 },
}
```

See [Lifecycle hooks](./lifecycle-hooks.md).

## Rate-limit queues

Queues declared in `skedyul.config.ts` are registered at server startup. Tool and webhook handlers can use `queuedFetch` — see [Rate-limit queues](./rate-limit-queues.md).

## Core API extension

Optional custom Core API methods via `coreApi` config:

```ts
server.create({
  // ...
  coreApi: {
    service: myCoreApiService, // implements custom methods
  },
})
```

Platform calls `POST /core` with `{ method, params }`. Built-in SDK clients use the same envelope against the Skedyul platform API.

## Context logging

Use `createContextLogger` for structured logs with request context:

```ts
import { createContextLogger } from 'skedyul'

const log = createContextLogger('my-tool')
log.info('Processing request', { toolName: 'hello' })
```

## Dockerfile

The SDK exports a default Dockerfile for dedicated deployments:

```ts
import { DEFAULT_DOCKERFILE } from 'skedyul'
```

## CORS

Configure CORS for serverless/API Gateway deployments:

```ts
cors: {
  allowOrigin: '*',
  allowMethods: 'GET, POST, OPTIONS',
  allowHeaders: 'Content-Type, Authorization',
}
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `SKEDYUL_API_URL` | Platform API base URL |
| `SKEDYUL_API_TOKEN` | Injected per-request in tool/webhook handlers |
| `PORT` | Listen port (dedicated mode) |

Tool handlers receive `SKEDYUL_API_TOKEN` in `context.env` automatically — no manual `configure()` needed at runtime.
