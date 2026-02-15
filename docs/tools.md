# Tools

Tools are the core building blocks of Skedyul apps. They're functions that AI agents can invoke via the Model Context Protocol (MCP), enabling your integration to perform actions in external systems.

## Overview

A tool consists of:
- **Name and description** - For AI agent discovery
- **Input schema** - Zod schema defining expected inputs
- **Handler** - Async function that executes the tool
- **Output schema** - Optional schema for structured output

## Defining a Tool

### Basic Structure

```ts
import { z } from 'skedyul'
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
const handler: ToolHandler<Input, Output> = async (input, context) => {
  const greeting = input.formal ? 'Good day' : 'Hello'
  
  return {
    output: { message: `${greeting}, ${input.name}!` },
    billing: { credits: 1 },
    meta: {
      success: true,
      message: 'Greeting generated',
      toolName: 'greet',
    },
  }
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
) => Promise<ToolExecutionResult<Output>> | ToolExecutionResult<Output>
```

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

## Tool Execution Result

Every handler must return a `ToolExecutionResult`:

```ts
interface ToolExecutionResult<Output> {
  output: Output | null           // Tool-specific output (null on error)
  billing: BillingInfo            // Credits consumed
  meta: ToolResponseMeta          // Metadata for AI evaluation
  effect?: ToolEffect             // Optional client-side effects
  error?: ToolError | null        // Structured error info
}
```

### Output

The tool's result data. Set to `null` if the tool failed.

```ts
return {
  output: {
    contacts: [
      { id: '1', name: 'John Doe', email: 'john@example.com' },
      { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
    ],
    total: 2,
  },
  // ...
}
```

### Billing

Every tool must report credits consumed:

```ts
interface BillingInfo {
  credits: number
}
```

Calculate credits based on your pricing model:

```ts
const handler: ToolHandler<Input, Output> = async (input, context) => {
  // Calculate credits based on work done
  const messageLength = input.message.length
  const credits = Math.ceil(messageLength / 100)  // 1 credit per 100 chars

  return {
    output: { sent: true },
    billing: { credits },
    meta: { success: true, message: 'Message sent', toolName: 'send_message' },
  }
}
```

### Meta

Metadata for AI evaluation and debugging:

```ts
interface ToolResponseMeta {
  success: boolean   // Whether the tool succeeded
  message: string    // Human-readable result description
  toolName: string   // Name of the tool
}
```

The `message` field helps AI agents understand what happened:

```ts
// Success
meta: {
  success: true,
  message: 'Created 3 appointments for next week',
  toolName: 'create_appointments',
}

// Failure
meta: {
  success: false,
  message: 'Calendar is fully booked for the requested dates',
  toolName: 'create_appointments',
}
```

### Effect

Optional client-side effects to execute after the tool completes:

```ts
interface ToolEffect {
  redirect?: string  // URL to navigate to
}
```

Example: Redirect after creating a resource:

```ts
return {
  output: { id: newRecord.id },
  billing: { credits: 1 },
  meta: { success: true, message: 'Record created', toolName: 'create_record' },
  effect: {
    redirect: `/records/${newRecord.id}`,
  },
}
```

### Error

Structured error information for failed tools:

```ts
interface ToolError {
  code: string     // Error code for programmatic handling
  message: string  // Human-readable error message
}
```

```ts
return {
  output: null,
  billing: { credits: 0 },
  meta: {
    success: false,
    message: 'Contact not found',
    toolName: 'get_contact',
  },
  error: {
    code: 'NOT_FOUND',
    message: 'No contact exists with the given ID',
  },
}
```

---

## Estimate Mode

Tools can be called in estimate mode to calculate billing without executing side effects:

```ts
const handler: ToolHandler<Input, Output> = async (input, context) => {
  // Check if this is an estimate request
  if (context.mode === 'estimate') {
    // Calculate credits without doing actual work
    const estimatedCredits = calculateCredits(input)
    
    return {
      output: null,
      billing: { credits: estimatedCredits },
      meta: { success: true, message: 'Estimate calculated', toolName: 'send_email' },
    }
  }

  // Execute the actual tool
  await sendEmail(input)
  
  return {
    output: { sent: true },
    billing: { credits: calculateCredits(input) },
    meta: { success: true, message: 'Email sent', toolName: 'send_email' },
  }
}
```

The estimate endpoint is available at `POST /estimate`:

```json
POST /estimate
{
  "name": "send_email",
  "inputs": { "to": "user@example.com", "subject": "Hello", "body": "..." }
}

200 OK
{
  "billing": { "credits": 5 }
}
```

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
import { z } from 'skedyul'
import type { ToolHandler, ToolDefinition } from 'skedyul'
import { instance } from 'skedyul'

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
  // Estimate mode - just calculate credits
  if (context.mode === 'estimate') {
    return {
      output: null,
      billing: { credits: 2 },
      meta: { success: true, message: 'Estimate: 2 credits', toolName: 'create_appointment' },
    }
  }

  // Validate client exists
  const client = await instance.get('client', input.clientId)
  if (!client) {
    return {
      output: null,
      billing: { credits: 0 },
      meta: { success: false, message: 'Client not found', toolName: 'create_appointment' },
      error: { code: 'CLIENT_NOT_FOUND', message: `No client with ID ${input.clientId}` },
    }
  }

  // Create the appointment
  const appointment = await instance.create('appointment', {
    client_id: input.clientId,
    service_id: input.serviceId,
    scheduled_at: input.dateTime,
    duration_minutes: input.duration,
    notes: input.notes,
    status: 'confirmed',
  })

  // Generate confirmation number
  const confirmationNumber = `APT-${Date.now().toString(36).toUpperCase()}`

  return {
    output: {
      appointmentId: appointment.id,
      confirmationNumber,
      scheduledAt: input.dateTime,
    },
    billing: { credits: 2 },
    meta: {
      success: true,
      message: `Appointment ${confirmationNumber} created for ${input.dateTime}`,
      toolName: 'create_appointment',
    },
    effect: {
      redirect: `/appointments/${appointment.id}`,
    },
  }
}

export const createAppointmentTool: ToolDefinition<Input, Output> = {
  name: 'create_appointment',
  label: 'Create Appointment',
  description: 'Schedule a new appointment for a client',
  inputSchema,
  outputSchema,
  handler,
  timeout: 30000,  // 30 seconds
}
```

---

## Best Practices

### 1. Always Return Billing

Even on errors, return billing info (usually 0 credits for failures):

```ts
return {
  output: null,
  billing: { credits: 0 },
  meta: { success: false, message: 'Error occurred', toolName: 'my_tool' },
  error: { code: 'ERROR', message: 'Something went wrong' },
}
```

### 2. Write Descriptive Meta Messages

Help AI agents understand results:

```ts
// Good
meta: { success: true, message: 'Found 15 contacts matching "John"', toolName: 'search_contacts' }

// Bad
meta: { success: true, message: 'OK', toolName: 'search_contacts' }
```

### 3. Use Appropriate Error Codes

Use consistent error codes for programmatic handling:

```ts
// Common error codes
'NOT_FOUND'
'VALIDATION_ERROR'
'PERMISSION_DENIED'
'RATE_LIMITED'
'EXTERNAL_SERVICE_ERROR'
'TIMEOUT'
```

### 4. Handle Estimate Mode

Support billing estimation for cost transparency:

```ts
if (context.mode === 'estimate') {
  return {
    output: null,
    billing: { credits: estimateCredits(input) },
    meta: { success: true, message: 'Estimate calculated', toolName: 'my_tool' },
  }
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
