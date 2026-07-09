---
name: integration-tools
description: |
  Use when creating or editing MCP tools: ToolDefinition, Zod schemas, handlers,
  createSuccessResponse, createValidationError, snake_case naming, and execution scopes.
---

# Integration Tools

## SDK docs

- `node_modules/skedyul/docs/tools.md` — handlers, context, billing, developer tools
- `node_modules/skedyul/docs/errors.md` — error helpers
- `node_modules/skedyul/docs/authentication.md` — token types, `token.exchange`

## Tool file pattern

One tool per file under `src/tools/`. Export a `ToolDefinition` and register in `src/registries.ts`.

```ts
import { z, type ToolDefinition, instance, createSuccessResponse, createValidationError } from 'skedyul'

const inputSchema = z.object({
  studio_name: z.string().describe('Name of the studio'),
  notes: z.string().optional(),
})

type Input = z.infer<typeof inputSchema>
type Output = { access_request_id: string; message: string }

export const requestAccessRegistry: ToolDefinition<Input, Output> = {
  name: 'request_access',          // snake_case — matches registry key
  label: 'Request Access',
  description: 'Create an access request with PENDING status',
  inputSchema,
  outputSchema: z.object({ access_request_id: z.string(), message: z.string() }),
  handler: async (input) => {
    if (!input.studio_name?.trim()) {
      return createValidationError('Studio name is required')
    }
    const record = await instance.create('access_request', {
      studio_name: input.studio_name.trim(),
      status: 'PENDING',
    })
    return createSuccessResponse({
      access_request_id: record.id,
      message: 'Access request created',
    })
  },
}
```

Registry (`src/registries.ts`):

```ts
export const toolRegistry: ToolRegistry = {
  request_access: requestAccessRegistry,
  approve_access: approveAccessRegistry,
}
```

## snake_case naming

- Tool `name` and registry keys: `request_access`, `parse_lab_report`, `get_members`
- Zod field names exposed to agents: `studio_name`, `branch_id`, `file_id`
- Error codes: `VALIDATION_ERROR`, `NOT_FOUND` (SCREAMING_SNAKE)

## Response helpers

Prefer helpers over hand-built `ToolExecutionResult`:

```ts
// Success
return createSuccessResponse({ orderId: '123' })
return createSuccessResponse(data, { effect: { redirect: '/orders/123' } })

// Validation failure (0 credits, structured error)
return createValidationError('Branch ID is required', 'branch_id')

// External service failure
return createExternalError('Glofox', 'API timeout')
```

Always return billing on every path (helpers handle `credits: 0` on errors).

## Execution context

```ts
import { isProvisionContext, isRuntimeContext, isDeveloperContext } from 'skedyul'

handler: async (input, context) => {
  if (context.mode === 'estimate') {
    return createSuccessResponse(null as never, { billing: { credits: 2 } })
  }
  if (isRuntimeContext(context)) {
    // context.workplace, context.appInstallationId available
  }
}
```

## Developer tools (`executionScope: 'app_version'`)

Admin tools use `sk_prv_` tokens — no `appInstallationId` in context. Follow discover → exchange → write:

```ts
export const approveAccessRegistry: ToolDefinition = {
  name: 'approve_access',
  executionScope: 'app_version',
  handler: async (input) => {
    const record = await instance.get('access_request', input.access_request_id)
    if (!record) return createValidationError('Access request not found')
    const scoped = await token.exchange(record.appInstallationId)
    await scoped.create('studio', { ... })
    return createSuccessResponse({ studio_id: '...' })
  },
}
```

See BFT `src/tools/approve-access.ts`.

## Timeouts and retries

```ts
timeout: 60000,   // ms; default 10s — use 600000 for AI parsing (Vetnostics)
retries: 3,       // optional platform retries
```

## Reference examples (read-only)

- **BFT** `private-integrations/integrations/bft/src/tools/` — runtime + developer tools
- **Vetnostics** `private-integrations/integrations/vetnostics/src/tools/parse_lab_report.ts` — long timeout, file input
- **Public email** `integrations/integrations/email/` — channel-triggered tools

## Anti-patterns

- **Do not edit reference clones**
- **Do not use `workspace:*` for `skedyul`**
- **Only edit `projectDirectory`**
- **Do not use camelCase tool names** (`requestAccess` → use `request_access`)
- **Do not throw for expected validation** — return `createValidationError`
- **Do not write CRM data from `app_version` tools without `token.exchange`**
- **Do not forget `.describe()` on Zod fields** — agents rely on schema descriptions

## Validate

```bash
pnpm build
# Local invoke: skedyul dev (see node_modules/skedyul/docs/cli.md)
```
