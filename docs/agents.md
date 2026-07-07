# Agents, skills & workflows

Skedyul supports two agent configuration models plus YAML-based skills and event-driven workflows.

## Overview

| Model | Where defined | Deployed via | Use case |
|-------|---------------|--------------|----------|
| **Provision agents** | `skedyul.config.ts` → `defineAgent()` | App version deploy | Simple multi-tenant agents bound to app tools |
| **Agent YAML v3** | `agents/*.yaml` | `skedyul agents deploy` | Skills-based autonomous agents per workplace |
| **Skills** | `skills/*.yaml` | `skedyul skills deploy` | Reusable capability bundles that own tools |
| **Workflow YAML v2** | `workflows/*.yaml` | `skedyul workflows deploy` | Event-driven automation with steps |

---

## Provision agents (`defineAgent`)

Declared in `skedyul.config.ts` and provisioned with your app version:

```ts
import { defineAgent } from 'skedyul'

export default defineAgent({
  handle: 'booking_assistant',
  label: 'Booking Assistant',
  description: 'Helps users schedule appointments',
  system: `You are an appointment scheduling assistant.
Help users find available times and book appointments.`,
  tools: ['list_availability', 'create_appointment', 'cancel_appointment'],
  llmModelId: 'gpt-4o',           // Optional model override
  parentAgent: 'composer',        // Optional: bind as sub-agent
})
```

| Field | Description |
|-------|-------------|
| `system` | Static system prompt (no templating) |
| `tools` | Tool names from your app's tool registry |
| `llmModelId` | Optional LLM model override |
| `parentAgent` | `'composer'` or another agent handle — creates an AGENT-type tool on the parent |

Add to config:

```ts
export default defineConfig({
  // ...
  agents: [bookingAssistant],
})
```

---

## Agent YAML v3

Workplace-deployed agents with skills, personas, scheduling policies, and versioning.

### Minimal example

```yaml
# agents/booking.yaml
$schema: https://skedyul.com/schemas/agent/v3
handle: booking
name: Booking Agent
description: Schedules appointments for patients

persona:
  name: Alex
  voice:
    style: Warm, concise, professional

skills:
  - scheduling
  - intake

tools:
  - system:skill:load

prompts:
  system: |
    You help patients book appointments. Confirm date, time, and service before booking.

runtime:
  model: gpt-4o
  personaModel: gpt-4o-mini
```

### Key sections

| Section | Description |
|---------|-------------|
| `persona` | Agent name and voice style/format constraints |
| `skills` | Skill references — skills own the tool definitions |
| `tools` | Bootstrap tools always available (e.g. `system:skill:load`) |
| `prompts` | `system`, `recovery`, `followUp`, `titleEnrichment` |
| `behavior` | Response limits, scheduling patterns, message splitting |
| `policies` | Message/tool approval requirements |
| `runtime` | `model` and `personaModel` LLM selection |
| `timeWindows` | Named availability policies |
| `sandbox` | Sandbox testing configuration |

### Validation

```ts
import { validateAgentYAMLV3, AgentYAMLV3Schema } from 'skedyul/schemas/agent-schema-v3'

const result = validateAgentYAMLV3(yamlObject)
```

### CLI

```bash
skedyul agents deploy --file ./agents/booking.yaml --workplace <subdomain>
skedyul agents publish --version <id> --workplace <subdomain>
skedyul chat --agent booking --workplace <subdomain>
```

See [CLI reference](./cli.md#agents-skedyul-agents).

### Planned features (schema accepted, not yet runtime)

The v3 schema accepts `events` and `memory` blocks, but these are **not yet implemented** at runtime. Use thread events and workflow bindings for event-driven behavior today.

---

## Skills

Skills bundle instructions and tool definitions. Agents load skills dynamically via `system:skill:load`.

### Skill YAML v2

```yaml
# skills/scheduling.yaml
$schema: https://skedyul.com/schemas/skill/v2
handle: scheduling
name: Appointment Scheduling
description: Find availability and book appointments

instructions: |
  When scheduling:
  1. Confirm the patient's preferred dates
  2. Check availability before offering times
  3. Confirm all details before booking

tools:
  - tool: list_availability
    description: List open appointment slots
    requiresApproval: false
  - tool: create_appointment
    description: Book a confirmed appointment
    requiresApproval: true
    constraints:
      maxCallsPerRun: 1
      idempotent: false

crmContext:
  patient:
    required: [name, phone]
    recommended: [email, date_of_birth]

examples:
  - input: "I need an appointment next Tuesday"
    output: "I can check Tuesday availability. Morning or afternoon?"
```

### Skill tool definition (v2)

| Field | Description |
|-------|-------------|
| `tool` | Tool name |
| `description` | Override description for the agent |
| `overrides` | Default input overrides |
| `sandbox.mock` | Mock response for sandbox testing |
| `requiresApproval` | Require human approval before execution |
| `constraints` | `maxCallsPerRun`, `idempotent`, `restricted`, `tags` |

### Helpers

```ts
import { defineSkill, validateSkillYAML, formatSkillInstructions } from 'skedyul'
import type { SkillYAML } from 'skedyul/skills/types'
```

---

## Workflow YAML v2

Event-driven workflows with steps, conditions, and Liquid templating.

```yaml
# workflows/send-reminder.yaml
$schema: https://skedyul.com/schemas/workflow/v1
handle: send_reminder
name: Send Appointment Reminder
description: Sends a reminder 24h before an appointment

inputs:
  appointmentId:
    type: string
    required: true

events:
  subscriptions:
    - event: thread.message.created
      conditions:
        channel: sms

steps:
  fetch_appointment:
    service: crm
    cmd: get
    inputs:
      model: appointment
      id: "{{ inputs.appointmentId }}"

  send_sms:
    service: messaging
    cmd: send
    needs: [fetch_appointment]
    inputs:
      to: "{{ steps.fetch_appointment.output.patient_phone }}"
      body: "Reminder: appointment tomorrow at {{ steps.fetch_appointment.output.time }}"

runtime:
  durable: true
  timeout: 5m
```

### Step fields

| Field | Description |
|-------|-------------|
| `service` / `cmd` | Service and command to invoke |
| `needs` | Step dependencies (DAG) |
| `inputs` | Literal values or Liquid templates |
| `condition` | Skip step if condition is false |
| `retry` | `attempts`, `backoff` (`linear` / `exponential`) |
| `timeout` | Step timeout (e.g. `30s`, `5m`) |

### CLI

```bash
skedyul workflows deploy --file ./workflows/send-reminder.yaml --workplace <subdomain>
skedyul workflows validate --file ./workflows/send-reminder.yaml
skedyul workflows run send_reminder --input appointmentId=abc --workplace <subdomain> --wait
```

### Provision workflows (UI automation)

Separate from YAML v2 — defined in `provision.ts` via `defineWorkflow()` for page-action automation templates:

```ts
defineWorkflow({
  handle: 'provision_number',
  label: 'Provision Number',
  path: './workflows/provision-number.yaml',
  actions: [/* ... */],
})
```

---

## Compiler

Compile YAML to intermediate representation (IR) for validation and deployment:

```ts
import { compileAgent, compileWorkflow } from 'skedyul'

const agentResult = compileAgent(agentYaml, { skillResolver })
const workflowResult = compileWorkflow(workflowYaml)
```

IR includes resolved skills, tools, policies, required permissions, estimated tokens, and workflow step ordering with cycle detection.

---

## Context system

Unified agent context for sandbox and production:

```ts
import {
  buildAgentContext,
  formatContextForPrompt,
  getContextByHandle,
  getContextByModel,
} from 'skedyul'
```

Context includes CRM data, sender info, thread participants, subscriptions, and associations. Use `skedyul chat --mock-context` for local testing.

---

## Thread events & triggers

### Thread events

```ts
import {
  ThreadEventTypeSchema,
  ThreadEventSchema,
  EventsConfigSchema,
} from 'skedyul'
```

Event types include `thread.message.*`, `thread.participant.*`, `thread.context.changed`, `thread.workflow.*`, and `custom.*`.

### Triggers (workflow bindings)

```ts
import {
  resolveInputMappings,
  evaluateTemplate,
  evaluateCondition,
  matchesTrigger,
} from 'skedyul'
```

Triggers map event payloads to workflow inputs using Liquid templates and conditions.

### App events (integration catalog)

Declare events your app emits via `event.create`:

```ts
export default defineConfig({
  events: [
    { name: 'customer.sync', description: 'Customer data synced from external system' },
  ],
})
```

Emit from tools or test via CLI:

```bash
skedyul event create customer.sync '{"customers":[]}' --workplace <subdomain>
```

### Signals (install-time subscriptions)

In `provision.ts`, signals subscribe workplaces to workflows on install:

```ts
// provision.ts
signals: [
  {
    handle: 'new_booking',
    label: 'New Booking',
    workflowHandle: 'send_confirmation',
  },
]
```

---

## Scheduling & time windows

Workflow-safe scheduling functions (usable in Temporal workflows):

```ts
import {
  calculateWaitTime,
  isTimeInWindowSlot,
  isTimeInWindowPolicy,
} from 'skedyul/scheduling'
```

Agent v3 `timeWindows` define named policies referenced in `behavior.scheduling`. Re-exported Zod schemas: `TimeWindowBehaviorSchema`, `TimeWindowPoliciesSchema`.

---

## Memory (SDK)

SDK-side memory service for testing and tooling:

```ts
import { MemoryService, InMemoryStore, createInMemoryService } from 'skedyul'
```

Agent YAML `memory` blocks are schema-valid but **not yet implemented** at runtime.

---

## Testing agents locally

```bash
# Interactive chat with SSE
skedyul chat --agent booking --workplace <subdomain>

# Sandbox mode (mocked tool responses from skill definitions)
skedyul chat --agent booking --workplace <subdomain> --sandbox

# Custom mock context
skedyul chat --agent booking --workplace <subdomain> --mock-context ./fixtures/context.json
```

---

## Related docs

- [CLI reference](./cli.md) — deploy, publish, versions, A/B, rollback
- [Configuration](./configuration.md) — `agents`, `events`, `signals` in config
- [Tools](./tools.md) — tool handlers agents invoke
- [Core API](./core-api.md) — `ai.generateObject`, `event.create`
