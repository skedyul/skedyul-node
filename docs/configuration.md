# Configuration

The `skedyul.config.ts` file defines your app's structure, including tools, webhooks, models, channels, and environment variables. This configuration is used during deployment to provision resources in the Skedyul platform.

## Basic Structure

```ts
// skedyul.config.ts
import { defineConfig } from 'skedyul'

export default defineConfig({
  // Required
  name: 'my-integration',
  version: '1.0.0',
  computeLayer: 'serverless',
  
  // Tool and webhook registries
  tools: import('./src/tools/registry'),
  webhooks: import('./src/webhooks/registry'),
  
  // Optional configurations
  provision: import('./config/provision.config'),
  install: import('./config/install.config'),
  agents: import('./config/agents.config'),
})
```

---

## SkedyulConfig

The top-level configuration interface:

```ts
interface SkedyulConfig {
  // Required
  name: string                    // App identifier (lowercase, hyphens)
  version: string                 // Semantic version
  computeLayer: 'dedicated' | 'serverless'
  
  // Registries (dynamic imports)
  tools?: Promise<{ default: ToolRegistry }>
  webhooks?: Promise<{ default: WebhookRegistry }>
  
  // Configuration modules
  provision?: Promise<{ default: ProvisionConfig }>
  install?: Promise<{ default: InstallConfig }>
  agents?: Promise<{ default: AgentDefinition[] }>
}
```

### Compute Layers

| Layer | Description | Use Case |
|-------|-------------|----------|
| `dedicated` | Long-running HTTP server (Docker/ECS) | High-traffic apps, persistent connections |
| `serverless` | AWS Lambda handler | Low-traffic apps, cost optimization |

---

## Provision Config

Defines resources created at the app version level (shared across all installations).

```ts
// config/provision.config.ts
import type { ProvisionConfig } from 'skedyul'

const config: ProvisionConfig = {
  // Environment variables (version-level)
  env: {
    EXTERNAL_API_URL: {
      label: 'External API URL',
      required: true,
      visibility: 'visible',
      placeholder: 'https://api.example.com',
    },
  },
  
  // Data models
  models: [
    {
      handle: 'compliance_record',
      label: 'Compliance Record',
      type: 'INTERNAL',
      fields: [
        { handle: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected'] },
        { handle: 'document_url', label: 'Document URL', type: 'url' },
        { handle: 'reviewed_at', label: 'Reviewed At', type: 'datetime' },
      ],
    },
  ],
  
  // Communication channels
  channels: [
    {
      handle: 'sms',
      label: 'SMS',
      identifierLabel: 'Phone Number',
      identifierPlaceholder: '+1234567890',
    },
  ],
  
  // Workflows
  workflows: [
    {
      handle: 'send_reminder',
      label: 'Send Reminder',
      description: 'Send appointment reminder via SMS',
    },
  ],
  
  // UI pages
  pages: [
    {
      handle: 'settings',
      label: 'Settings',
      fields: [
        { handle: 'auto_reply', label: 'Auto Reply', type: 'boolean' },
        { handle: 'reply_message', label: 'Reply Message', type: 'text' },
      ],
    },
  ],
  
  // Navigation
  navigation: {
    items: [
      { label: 'Dashboard', pageHandle: 'dashboard' },
      { label: 'Settings', pageHandle: 'settings' },
    ],
  },
}

export default config
```

### Models

Define data models that your app manages:

```ts
interface ModelDefinition {
  handle: string                    // Unique identifier
  label: string                     // Display name
  type: 'INTERNAL' | 'SHARED'       // Visibility
  fields: FieldDefinition[]         // Model fields
  relationships?: RelationshipDefinition[]
}
```

#### Model Types

| Type | Description | Use Case |
|------|-------------|----------|
| `INTERNAL` | Only accessible by your app | App-specific data (logs, settings) |
| `SHARED` | Linked to user's existing models | Contacts, appointments |

#### Field Types

```ts
interface FieldDefinition {
  handle: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'datetime' | 'url' | 'email' | 'phone' | 'file' | 'relation'
  required?: boolean
  options?: string[]              // For 'select' type
  relationModel?: string          // For 'relation' type
  description?: string
}
```

### Channels

Define communication channel types:

```ts
interface ChannelDefinition {
  handle: string                  // e.g., 'sms', 'email', 'whatsapp'
  label: string                   // Display name
  identifierLabel: string         // e.g., 'Phone Number', 'Email Address'
  identifierPlaceholder?: string  // Input placeholder
  identifierPattern?: string      // Validation regex
}
```

### Workflows

Define automated workflows:

```ts
interface WorkflowDefinition {
  handle: string
  label: string
  description?: string
  triggers?: WorkflowTrigger[]
}
```

### Pages

Define UI pages for your app:

```ts
interface PageDefinition {
  handle: string
  label: string
  description?: string
  fields: PageFieldDefinition[]
  actions?: PageActionDefinition[]
}

interface PageFieldDefinition {
  handle: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'datetime' | 'file'
  required?: boolean
  options?: string[]
  defaultValue?: unknown
  description?: string
  onChange?: string              // Tool name to call on change
}

interface PageActionDefinition {
  handle: string
  label: string
  tool: string                   // Tool name to execute
  variant?: 'primary' | 'secondary' | 'danger'
}
```

---

## Install Config

Defines per-installation configuration (user-provided credentials and settings).

```ts
// config/install.config.ts
import type { InstallConfig } from 'skedyul'

const config: InstallConfig = {
  env: {
    // API credentials
    API_KEY: {
      label: 'API Key',
      required: true,
      visibility: 'encrypted',
      description: 'Your API key from the external service',
    },
    
    // Optional settings
    BASE_URL: {
      label: 'API Base URL',
      required: false,
      visibility: 'visible',
      placeholder: 'https://api.example.com',
      defaultValue: 'https://api.example.com',
    },
    
    // OAuth tokens (set by oauth_callback handler)
    ACCESS_TOKEN: {
      label: 'Access Token',
      required: false,
      visibility: 'encrypted',
      internal: true,  // Hidden from user
    },
    REFRESH_TOKEN: {
      label: 'Refresh Token',
      required: false,
      visibility: 'encrypted',
      internal: true,
    },
  },
}

export default config
```

### Environment Variable Definition

```ts
interface EnvVariableDefinition {
  label: string                   // Display label
  required?: boolean              // Is this required for installation?
  visibility: 'visible' | 'encrypted'
  placeholder?: string            // Input placeholder
  defaultValue?: string           // Default value
  description?: string            // Help text
  internal?: boolean              // Hide from user (set programmatically)
  pattern?: string                // Validation regex
}
```

### Visibility Options

| Visibility | Behavior |
|------------|----------|
| `visible` | Shown in plain text, stored unencrypted |
| `encrypted` | Hidden during input, stored encrypted |

---

## Agents Config

Define AI agents that can use your tools:

```ts
// config/agents.config.ts
import type { AgentDefinition } from 'skedyul'

const agents: AgentDefinition[] = [
  {
    handle: 'appointment_assistant',
    label: 'Appointment Assistant',
    description: 'Helps users schedule and manage appointments',
    systemPrompt: `You are an appointment scheduling assistant. 
Help users find available times and book appointments.
Always confirm the date, time, and service before booking.`,
    tools: ['list_availability', 'create_appointment', 'cancel_appointment'],
  },
  {
    handle: 'support_agent',
    label: 'Support Agent',
    description: 'Handles customer support inquiries',
    systemPrompt: `You are a helpful support agent.
Answer questions about services and help resolve issues.`,
    tools: ['search_faq', 'create_ticket', 'get_order_status'],
  },
]

export default agents
```

### Agent Definition

```ts
interface AgentDefinition {
  handle: string                  // Unique identifier
  label: string                   // Display name
  description?: string            // Agent description
  systemPrompt: string            // System prompt for the AI
  tools: string[]                 // Tool names this agent can use
  model?: string                  // AI model to use (optional)
}
```

---

## Environment Variable Merging

Environment variables are merged from multiple sources in order of precedence:

1. **Request-level** - Passed in the tool/webhook request (highest priority)
2. **Installation-level** - User-provided during installation
3. **Version-level** - Defined in provision config
4. **Process environment** - `process.env`
5. **MCP_ENV** - Container runtime override
6. **MCP_ENV_JSON** - Build-time configuration (lowest priority)

```ts
// In a tool handler
const handler: ToolHandler<Input, Output> = async (input, context) => {
  // context.env contains merged environment variables
  const apiKey = context.env.API_KEY
  const baseUrl = context.env.BASE_URL || 'https://api.default.com'
  // ...
}
```

---

## Complete Example

```ts
// skedyul.config.ts
import { defineConfig } from 'skedyul'

export default defineConfig({
  name: 'acme-integration',
  version: '2.1.0',
  computeLayer: 'serverless',
  
  tools: import('./src/tools/registry'),
  webhooks: import('./src/webhooks/registry'),
  provision: import('./config/provision.config'),
  install: import('./config/install.config'),
  agents: import('./config/agents.config'),
})
```

```ts
// config/provision.config.ts
import type { ProvisionConfig } from 'skedyul'

const config: ProvisionConfig = {
  env: {
    ACME_API_URL: {
      label: 'ACME API URL',
      required: true,
      visibility: 'visible',
      defaultValue: 'https://api.acme.com',
    },
  },
  
  models: [
    {
      handle: 'sync_log',
      label: 'Sync Log',
      type: 'INTERNAL',
      fields: [
        { handle: 'synced_at', label: 'Synced At', type: 'datetime' },
        { handle: 'records_synced', label: 'Records Synced', type: 'number' },
        { handle: 'status', label: 'Status', type: 'select', options: ['success', 'partial', 'failed'] },
      ],
    },
    {
      handle: 'contact',
      label: 'Contact',
      type: 'SHARED',
      fields: [
        { handle: 'external_id', label: 'ACME ID', type: 'text' },
        { handle: 'last_synced', label: 'Last Synced', type: 'datetime' },
      ],
    },
  ],
  
  channels: [
    {
      handle: 'email',
      label: 'Email',
      identifierLabel: 'Email Address',
      identifierPlaceholder: 'user@example.com',
      identifierPattern: '^[^@]+@[^@]+\\.[^@]+$',
    },
  ],
  
  pages: [
    {
      handle: 'sync_settings',
      label: 'Sync Settings',
      fields: [
        { handle: 'auto_sync', label: 'Enable Auto Sync', type: 'boolean', defaultValue: true },
        { handle: 'sync_interval', label: 'Sync Interval (hours)', type: 'number', defaultValue: 24 },
      ],
      actions: [
        { handle: 'sync_now', label: 'Sync Now', tool: 'trigger_sync', variant: 'primary' },
      ],
    },
  ],
}

export default config
```

```ts
// config/install.config.ts
import type { InstallConfig } from 'skedyul'

const config: InstallConfig = {
  env: {
    ACME_API_KEY: {
      label: 'ACME API Key',
      required: true,
      visibility: 'encrypted',
      description: 'Find this in your ACME dashboard under Settings > API',
    },
    ACME_WORKSPACE_ID: {
      label: 'ACME Workspace ID',
      required: true,
      visibility: 'visible',
      placeholder: 'ws_xxxxxxxx',
    },
  },
}

export default config
```

---

## Validation

Use the CLI to validate your configuration:

```bash
skedyul dev validate
```

This checks:
- Required fields are present
- Handle formats are valid (lowercase, alphanumeric, underscores)
- Field types are valid
- References (tool names, page handles) exist
- No duplicate handles

---

## Best Practices

### 1. Use Descriptive Handles

```ts
// Good
handle: 'appointment_reminder'
handle: 'client_contact'

// Bad
handle: 'ar'
handle: 'cc1'
```

### 2. Provide Help Text

```ts
env: {
  API_KEY: {
    label: 'API Key',
    required: true,
    visibility: 'encrypted',
    description: 'Find this in Settings > API Keys in your dashboard',
    placeholder: 'sk_live_xxxxxxxx',
  },
}
```

### 3. Use SHARED Models for User Data

```ts
// Link to user's existing contacts
models: [
  {
    handle: 'contact',
    label: 'Contact',
    type: 'SHARED',  // User selects which model to link
    fields: [
      { handle: 'external_id', label: 'External ID', type: 'text' },
    ],
  },
]
```

### 4. Group Related Pages

```ts
navigation: {
  items: [
    { label: 'Overview', pageHandle: 'dashboard' },
    { 
      label: 'Settings',
      children: [
        { label: 'General', pageHandle: 'settings_general' },
        { label: 'Notifications', pageHandle: 'settings_notifications' },
        { label: 'Advanced', pageHandle: 'settings_advanced' },
      ],
    },
  ],
}
```
