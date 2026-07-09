# Tools

Tools are the core building blocks of Skedyul apps. They're functions that AI agents can invoke via the Model Context Protocol (MCP), enabling your integration to perform actions in external systems.

## Overview

A tool consists of:
- **Name and description** - For AI agent discovery (use `snake_case` for names)
- **Input schema** - Zod schema defining expected inputs
- **Handler** - Async function that executes the tool
- **Output schema** - Optional schema for structured output

## Defining a Tool

### Basic Structure

```ts
import { z, createSuccessResponse } from 'skedyul'
import type { ToolHandler, ToolDefinition } from 'skedyul'

// 1. Define input schema
const inputSchema = z.object({
  name: z.string().describe('Name to greet'),
  formal: z.boolean().optional().describe('Use formal greeting'),
})

// 2. Define types
type Input = z.infer<typeof inputSchema>
type Output = { message: string }

// 3. Implement handler
const handler: ToolHandler<Input, Output> = async (input) => {
  const greeting = input.formal ? 'Good day' : 'Hello'
  return createSuccessResponse({
    message: `${greeting}, ${input.name}!`,
  })
}

// 4. Export tool definition
export const greetTool: ToolDefinition<Input, Output> = {
  name: 'greet',
  label: 'Greet User',  // Optional display name
  description: 'Generate a greeting message',
  inputSchema,
  handler,
  timeout: 10000,  // Optional: 10 seconds (default)
}
```

### Tool Registry

Collect tools into a registry for the server:

```ts
// src/tools/registry.ts
import type { ToolRegistry } from 'skedyul'
import { greetTool } from './greet'
import { sendEmailTool } from './send-email'
import { listContactsTool } from './list-contacts'

export const toolRegistry: ToolRegistry = {
  greet: greetTool,
  send_email: sendEmailTool,
  list_contacts: listContactsTool,
}
```

---

## Tool Handler

### Signature

```ts
type ToolHandler<Input, Output> = (
  input: Input,
  context: ToolExecutionContext,
) => Promise<ToolResult<Output>> | ToolResult<Output>
```

Handlers return a **`ToolResult`** discriminated union (`ToolSuccess` or `ToolFailure`). Use the `create*` helpers from `skedyul` — do not return legacy `{ output, billing, meta }` shapes.

### Input Parameter

The `input` parameter contains the validated tool inputs. The SDK automatically validates inputs against your Zod schema before calling the handler.

```ts
const handler: ToolHandler<Input, Output> = async (input, context) => {
  // input is already validated and typed
  const { name, email, phone } = input
  // ...
}
```

### Context Parameter

The `context` parameter provides execution context including environment, app info, and trigger details.

---

## Execution Context

The context varies based on how the tool was triggered:

### Base Context (All Triggers)

```ts
interface BaseToolContext {
  env: Record<string, string | undefined>  // Environment variables
  mode: 'execute' | 'estimate'             // Execution mode
  app: { id: string; versionId: string }   // App info
}
```

### Provision Context

For tools triggered during provisioning (no installation context):

```ts
interface ProvisionToolContext extends BaseToolContext {
  trigger: 'provision'
}
```

### Runtime Context

For tools triggered at runtime (has installation context):

```ts
interface RuntimeToolContext extends BaseToolContext {
  trigger: 'field_change' | 'page_action' | 'form_submit' | 'agent' | 'workflow'
  appInstallationId: string
  workplace: { id: string; subdomain: string }
  request: { url: string; params: Record<string, string>; query: Record<string, string> }
}
```

### Trigger-Specific Context

Each trigger type includes additional context:

```ts
// Field change trigger
interface FieldChangeToolContext extends RuntimeToolContext {
  trigger: 'field_change'
  field: {
    handle: string
    type: string
    pageHandle: string
    value: unknown
    previousValue?: unknown
  }
}

// Page action trigger
interface PageActionToolContext extends RuntimeToolContext {
  trigger: 'page_action'
  page: {
    handle: string
    values: Record<string, unknown>
  }
}

// Form submit trigger
interface FormSubmitToolContext extends RuntimeToolContext {
  trigger: 'form_submit'
  form: {
    handle: string
    values: Record<string, unknown>
  }
}

// Agent trigger (AI invocation)
interface AgentToolContext extends RuntimeToolContext {
  trigger: 'agent'
}

// Workflow trigger
interface WorkflowToolContext extends RuntimeToolContext {
  trigger: 'workflow'
}
```

### Type Guards

Use type guards to narrow context types:

```ts
import { isProvisionContext, isRuntimeContext } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  if (isProvisionContext(context)) {
    // No installation context available
    console.log('Running in provision mode')
  }

  if (isRuntimeContext(context)) {
    // Has installation context
    console.log(`Workplace: ${context.workplace.subdomain}`)
    console.log(`Installation: ${context.appInstallationId}`)
  }

  // Check specific trigger
  if (context.trigger === 'field_change') {
    console.log(`Field ${context.field.handle} changed to ${context.field.value}`)
  }

  // ...
}
```

---

## Tool Result (`ToolResult`)

Every handler returns `ToolSuccess<T>` or `ToolFailure`:

```ts
// Success
type ToolSuccess<T> = {
  success: true
  output: T
  dataBlocks?: DataBlock[]   // Rich UI cards (datetime, spreadsheet, etc.)
  warnings?: ToolWarning[]
  pagination?: ToolPagination
  billing?: ToolBilling
  effect?: ToolEffect        // e.g. { redirect: '/path' }
  cursor?: Record<string, unknown>
}

// Failure
type ToolFailure = {
  success: false
  error: {
    code: ErrorCode          // VALIDATION_ERROR, NOT_FOUND, EXTERNAL_SERVICE_ERROR, ...
    message: string
    category?: ErrorCategory // validation | auth | network | timeout | external | internal
    field?: string
    details?: Record<string, unknown>
  }
  retry?: ToolRetry          // { allowed: true, afterMs: 60000 }
  partialOutput?: unknown
  billing?: ToolBilling
  effect?: ToolEffect
}
```

### Success helpers

```ts
import {
  createSuccessResponse,
  createListResponse,
} from 'skedyul'

// Simple success
return createSuccessResponse({ orderId: 'ord_123' })

// With rich UI data blocks
return createSuccessResponse(
  { booking: bookingData },
  {
    dataBlocks: [{
      type: 'dateTime',
      title: 'Booking Confirmed',
      datetime: '2026-05-20T14:00:00',
      status: 'confirmed',
    }],
  },
)

// Paginated list
return createListResponse(items, { hasMore: true, total: 100 })
```

### Error helpers

```ts
import {
  createValidationError,
  createNotFoundError,
  createExternalError,
  createAuthError,
  createRateLimitError,
  createErrorResponse,
} from 'skedyul'

return createValidationError('Email is required', 'email')
return createNotFoundError('Order', orderId)
return createExternalError('Glofox API', 'Connection timeout')
return createAuthError('Invalid API key', { expired: true })
return createRateLimitError(60_000)
```

### Type guards

```ts
import { isSuccess, isFailure, isRetryable, getRetryDelay } from 'skedyul'

if (isSuccess(result)) {
  console.log(result.output)
}
if (isFailure(result) && isRetryable(result)) {
  const delay = getRetryDelay(result)
}
```

### Billing

Optional `billing` on success or failure:

```ts
return createSuccessResponse(output, {
  billing: { credits: 2 },
})
```

---

## Estimate Mode

Tools can be called in estimate mode (`context.mode === 'estimate'`) to calculate billing without side effects:

```ts
import { createSuccessResponse, createEstimation } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  if (context.mode === 'estimate') {
    return createSuccessResponse(null as unknown as Output, {
      billing: { credits: 5 },
    })
  }

  await sendEmail(input)
  return createSuccessResponse({ sent: true }, { billing: { credits: 5 } })
}
```

See [Estimation and billing](./estimation-and-billing.md) for `createEstimation` and money helpers.

---

## Input Schemas

Use Zod to define input schemas with validation and descriptions:

```ts
import { z } from 'skedyul'

const inputSchema = z.object({
  // Required string
  email: z.string().email().describe('Recipient email address'),
  
  // Optional with default
  priority: z.enum(['low', 'normal', 'high']).default('normal').describe('Email priority'),
  
  // Optional boolean
  sendCopy: z.boolean().optional().describe('Send a copy to sender'),
  
  // Array of objects
  attachments: z.array(z.object({
    fileId: z.string(),
    name: z.string(),
  })).optional().describe('File attachments'),
  
  // Nested object
  scheduling: z.object({
    sendAt: z.string().datetime().optional(),
    timezone: z.string().optional(),
  }).optional().describe('Scheduling options'),
})
```

### Schema with JSON Override

For complex schemas, you can provide a pre-computed JSON schema:

```ts
const inputSchema: ToolSchema = {
  zod: z.object({ ... }),
  jsonSchema: {
    type: 'object',
    properties: { ... },
    required: ['email'],
  },
}
```

---

## Output Schemas

Optional but recommended for structured output validation:

```ts
const outputSchema = z.object({
  messageId: z.string(),
  sentAt: z.string().datetime(),
  status: z.enum(['sent', 'queued', 'failed']),
})

export const sendEmailTool: ToolDefinition<Input, Output> = {
  name: 'send_email',
  description: 'Send an email',
  inputSchema,
  outputSchema,  // Optional
  handler,
}
```

---

## Complete Example

```ts
// src/tools/create-appointment.ts
import {
  z,
  instance,
  createSuccessResponse,
  createNotFoundError,
  createValidationError,
} from 'skedyul'
import type { ToolHandler, ToolDefinition } from 'skedyul'

const inputSchema = z.object({
  clientId: z.string().describe('Client ID'),
  serviceId: z.string().describe('Service type ID'),
  dateTime: z.string().datetime().describe('Appointment date and time'),
  duration: z.number().min(15).max(480).describe('Duration in minutes'),
  notes: z.string().optional().describe('Additional notes'),
})

const outputSchema = z.object({
  appointmentId: z.string(),
  confirmationNumber: z.string(),
  scheduledAt: z.string(),
})

type Input = z.infer<typeof inputSchema>
type Output = z.infer<typeof outputSchema>

const handler: ToolHandler<Input, Output> = async (input, context) => {
  if (context.mode === 'estimate') {
    return createSuccessResponse(null as unknown as Output, {
      billing: { credits: 2 },
    })
  }

  const client = await instance.get('client', input.clientId)
  if (!client) {
    return createNotFoundError('Client', input.clientId)
  }

  const appointment = await instance.create('appointment', {
    client_id: input.clientId,
    service_id: input.serviceId,
    scheduled_at: input.dateTime,
    duration_minutes: input.duration,
    notes: input.notes,
    status: 'confirmed',
  })

  const confirmationNumber = `APT-${Date.now().toString(36).toUpperCase()}`

  return createSuccessResponse(
    {
      appointmentId: appointment.id,
      confirmationNumber,
      scheduledAt: input.dateTime,
    },
    {
      billing: { credits: 2 },
      effect: { redirect: `/appointments/${appointment.id}` },
    },
  )
}

export const createAppointmentTool: ToolDefinition<Input, Output> = {
  name: 'create_appointment',
  label: 'Create Appointment',
  description: 'Schedule a new appointment for a client',
  inputSchema,
  outputSchema,
  handler,
  timeout: 30000,
}
```

---

## Best Practices

### 1. Use response helpers

Prefer `createSuccessResponse` / `createValidationError` over hand-rolled objects:

```ts
if (!input.email) {
  return createValidationError('Email is required', 'email')
}
return createSuccessResponse({ sent: true }, { billing: { credits: 1 } })
```

### 2. Write clear error messages

Help AI agents understand results:

```ts
// Good — specific, actionable
return createValidationError('Contact not found for email "john@example.com"', 'email')

// Bad — vague
return createValidationError('Not found')
```

### 3. Use Appropriate Error Codes

Use consistent error codes for programmatic handling:

```ts
return createErrorResponse('Contact not found', 'NOT_FOUND')
return createValidationError('Invalid date range', 'VALIDATION_ERROR')
```

Common codes: `NOT_FOUND`, `VALIDATION_ERROR`, `PERMISSION_DENIED`, `RATE_LIMITED`, `EXTERNAL_SERVICE_ERROR`, `TIMEOUT`.

### 4. Handle Estimate Mode

Support billing estimation for cost transparency:

```ts
if (context.mode === 'estimate') {
  return createEstimation({
    credits: estimateCredits(input),
    message: 'Estimate calculated',
  })
}
```

### 5. Set Appropriate Timeouts

Override the default 10-second timeout for long-running operations:

```ts
export const longRunningTool: ToolDefinition = {
  name: 'generate_report',
  description: 'Generate a comprehensive report',
  inputSchema,
  handler,
  timeout: 120000,  // 2 minutes
}
```

---

## Developer Tools (Admin Tools)

Developer tools are invoked from the Developer Console (not by end-users) and operate across all installations of an app. They receive `sk_prv_` (provision) tokens instead of `sk_wkp_` (workplace) tokens.

### Execution Scope

Use the `executionScope` property to mark tools as developer tools:

```ts
export const myAdminTool: ToolDefinition = {
  name: 'approve_request',
  description: 'Approve a pending request (admin only)',
  inputSchema,
  handler,
  executionScope: 'app_version',  // No appInstallationId required
}
```

| Scope | Token | Context | Use Case |
|-------|-------|---------|----------|
| `installation` (default) | `sk_wkp_` | Has `appInstallationId` | Standard runtime tools |
| `app_version` | `sk_prv_` | No `appInstallationId` | Developer/admin tools |

### Developer Context Types

Developer tools receive a context without `appInstallationId`:

```ts
interface DeveloperPageActionToolContext {
  trigger: 'developer_page_action'
  app: { id: string; versionId: string }
  env: Record<string, string | undefined>
  mode: 'execute' | 'estimate'
}

interface DeveloperFormSubmitToolContext {
  trigger: 'developer_form_submit'
  app: { id: string; versionId: string }
  env: Record<string, string | undefined>
  mode: 'execute' | 'estimate'
}
```

Use the `isDeveloperContext` type guard:

```ts
import { isDeveloperContext } from 'skedyul'

const handler: ToolHandler<Input, Output> = async (input, context) => {
  if (isDeveloperContext(context)) {
    // No appInstallationId available - must discover from records
    console.log('Running as developer tool')
  }
}
```

### Discover → Exchange → Write Pattern

Developer tools must follow this pattern for CRM writes:

1. **Discover**: Use global `instance` API to find records (with their `appInstallationId`)
2. **Exchange**: Call `token.exchange(appInstallationId)` to get a scoped `InstanceClient`
3. **Write**: Use the scoped client for all create/update operations

This ensures CRM data stays properly linked to installations.

```ts
import { instance, token, createSuccessResponse, createValidationError } from 'skedyul'

export const approveRequestTool: ToolDefinition = {
  name: 'approve_request',
  description: 'Approve a pending request',
  inputSchema: z.object({ requestId: z.string() }),
  executionScope: 'app_version',
  handler: async (input) => {
    // Step 1: Discovery - use global instance (sk_prv_ token)
    const request = await instance.get('request', input.requestId)
    if (!request) {
      return createValidationError('Request not found')
    }
    if (!request.appInstallationId) {
      return createValidationError('Request missing appInstallationId')
    }

    // Step 2: Exchange for scoped client
    const scopedInstance = await token.exchange(request.appInstallationId)

    // Step 3: Writes - use scoped client (sk_wkp_ internally)
    const result = await scopedInstance.create('approval', {
      request_id: request.id,
      approved_at: new Date().toISOString(),
    })

    await scopedInstance.update('request', request.id, {
      status: 'APPROVED',
      approval_id: result.id,
    })

    return createSuccessResponse({ approvalId: result.id })
  },
}
```

### Why This Pattern?

- **Minimum privilege**: Discovery reads use the more powerful `sk_prv_` token only for lookups
- **Proper attribution**: Writes use `sk_wkp_` so CRM records are linked to the correct installation
- **Clear separation**: Tool handlers don't need `runWithConfig` blocks - the scoped client handles it

### InstanceClient Interface

The `token.exchange` method returns an `InstanceClient` with the same methods as the global `instance`:

```ts
interface InstanceClient {
  list(modelHandle: string, args?: InstanceListArgs): Promise<InstanceListResult>
  get(modelHandle: string, id: string): Promise<InstanceData | null>
  create(modelHandle: string, data: Record<string, unknown>): Promise<InstanceData>
  update(modelHandle: string, id: string, data: Record<string, unknown>): Promise<InstanceData>
  delete(modelHandle: string, id: string): Promise<{ deleted: boolean }>
  // ... batch methods
}
```

For advanced cases needing the raw token, use `token.exchangeRaw`:

```ts
const { token: scopedToken, appInstallationId } = await token.exchangeRaw(installId)

// Manual config management
runWithConfig({ apiToken: scopedToken, baseUrl: getConfig().baseUrl }, async () => {
  await communicationChannel.list({ filter: { ... } })
})
