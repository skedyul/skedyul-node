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
| `skills` | Skill references — skills own the tool definitions. A workplace skill is a bare handle (`booking`). A skill from an installed app is `@app-handle/skills/skill-handle` (for example `@acme/skills/booking`). Set `alwaysLoad: true` to pre-seed that skill before the first model step; otherwise the agent calls `system:skill:load`. |
| `tools` | Bootstrap tools always available (e.g. `system:skill:load`). A tool may be a name or `{ tool, description?, fields? }`. `fields` is the CRM list projection: those field handles are hydrated. Omit `fields` to hydrate every field. |
| `prompts` | `system` and `titleEnrichment`. `recovery` and `followUp` parse and are marked not implemented. |
| `behavior` | Response limits, the acknowledgement gate, conversation policy, and scheduling patterns |
| `settings` | Install-scoped values the agent asks for by key (`guidance`, `role: persona_name`) |
| `policies` | Message/tool approval requirements |
| `runtime` | `model` and `personaModel` LLM selection |
| `timeWindows` | Named availability policies |
| `sandbox` | Sandbox testing context. `sandbox.enabled` parses and is marked not implemented — the caller chooses sandbox mode. |

Skill `evaluators:` (on the skill YAML, not the agent) are quality rubrics for that skill's replies and writes. The agent owns only turn-level `target: skill` routing evaluators.

### Behavior

`behavior.responses` limits how the agent sends:

| Key | Default | Meaning |
|-----|---------|---------|
| `maxImmediate` / `maxScheduled` / `requireFinal` | | Budgets and whether a final message is required |
| `allowSilent` | `false` | The agent may call `system:message:skip` |
| `allowSchedule` | `false` | The agent may schedule a future send |
| `humanize` | `false` | Strip em dashes, smart quotes, and bullet leaders from outbound text |
| `responseGate.enabled` | on when `allowSilent` is set | Treat a bare acknowledgement as a reason to skip |
| `responseGate.strictMode` | `false` | Block the send instead of recommending a skip |
| `responseGate.minAckConfidence` | `0.7` | Confidence required to call a message an acknowledgement (`0`–`1`) |

`behavior.conversation` declares which conversational rules this agent wants. Each rule is `off` (not stated, not checked), `prompt` (stated, never blocks), or `reject` (the send is rejected and the model rewrites it). No level ends the run. Every rule defaults to `prompt` except `oneQuestionPerMessage`, which defaults to `off`.

| Key | What it asks for |
|-----|------------------|
| `repeatQuestions` | Do not re-ask something the customer already answered |
| `exampleCopy` | Do not send skill example wording verbatim |
| `namedDelayFollowUp` | A named delay or a promised check-in should produce a scheduled send |
| `oneMessagePerTurn` | Keep the turn to one message. Prompt-only; the hard count is `behavior.responses.maxImmediate` |
| `fillerBan` | Skip rather than send filler. Stated only when `allowSilent` is set |
| `cancelPendingOnAck` | A bare acknowledgement does not cancel a pending follow-up |
| `oneQuestionPerMessage` | Ask one thing at a time. `reject` blocks a send with more than one question. Default `off` |
| `onPolicyRejectExhausted` | `send` (default) releases the last rejected message; `skip` records a skip |

`acknowledgeTimeGaps` (`false` by default) mentions a long gap since the last message. `timeGapThreshold` is that gap, for example `"3 days"`.

`behavior.responses.messageSplitting` is accepted and marked not implemented.

### Settings

`settings` lists install-scoped values the agent asks for. The platform prints the label and value; it does not interpret the key.

| Field | Meaning |
|-------|---------|
| `key` | Resolved against the install's agent config and env |
| `label` | Shown to the model and in the console |
| `guidance` | Prompt text. `{{value}}` is the install value, `{{workplace}}` is the workplace name |
| `role` | `persona_name` uses this value as the agent's name for the install |

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

### Accepted but not implemented

These keys still parse so existing YAML validates. Each is marked `Not implemented` on the schema: setting them changes nothing.

| Key | Use instead |
|-----|-------------|
| `events` | Thread events and workflow bindings |
| `memory` | No replacement |
| `prompts.recovery`, `prompts.followUp` | `prompts.system` |
| `behavior.responses.messageSplitting` | `behavior.responses.maxImmediate` |
| `sandbox.enabled` | The caller (playground, scenario replay, CLI) chooses sandbox mode |
| `skills[].instructions` | The skill file |
| `skills[].enabled` | Remove the skill from `skills` |

---

## Skills

Skills bundle instructions and tool definitions. Agents load skills dynamically via `system:skill:load`.

Reference a workplace skill by its handle. Reference a skill provided by an installed app with `@app-handle/skills/skill-handle`. The app handle is the integration's handle (`acme`), and the skill handle is the handle declared in that app's `provision.skills`.

```yaml
skills:
  - skill: booking
    description: Workplace booking flow
    alwaysLoad: true
  - skill: "@acme/skills/booking"
    description: Load when the caller wants an appointment
```

`alwaysLoad: true` pre-seeds that skill before the first model step. Omit it and the agent loads the skill with `system:skill:load`.

`system:skill:load` takes that same reference as `name`.

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
    fields:
      - name
      - starts_at
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

ownedFields:
  - appointment_time
requiredWrites:
  - appointment_time
```

`ownedFields` are entity field handles this skill may write while loaded. `requiredWrites` are handles it must have written before it replies. Only handles mapped in the install's CRM map are enforced.

### Skill tool definition (v2)

| Field | Description |
|-------|-------------|
| `tool` | Tool name |
| `description` | Override description for the agent |
| `fields` | CRM list field handles to hydrate (for example `name`, `kind`). Omit to hydrate every field. |
| `overrides` | Default input overrides |
| `sandbox.mock` | Mock response for sandbox testing |
| `requiresApproval` | Require human approval before execution |
| `constraints` | `maxCallsPerRun`, `idempotent`, `restricted`, `tags` |
| `needs` | Memory ids that must already be filled before this tool runs |

### Memory

A skill can declare memory the harness must have before a later tool or a customer reply. Each entry is a row in thread `AgentMemory` (key `memory:<id>`) with `expiresAt` taken from `ttl`. The model cannot write these keys. This is separate from the scratchpad and from the agent's rolling summary.

Two fillers:

- **CRM.** When `entity` and `match` are set and the install has a live CRM map, one instance whose match field equals the caller (and whose map match field, the remote id, is set) fills the entry. The provider tool does not run.
- **Tool.** Otherwise the named `tool` must succeed. A successful call writes the entry and, when `entity` is mapped, upserts that instance on the remote id.

`needs` on a tool lists only its immediate memory ids. `reply.needs` gates `system:message:send`. A skill that books without texting the customer omits `reply`.

```yaml
memory:
  - id: client
    entity: client
    match: phone
    tool: app:acme:clients_search
    ttl: 2h
  - id: calendars
    tool: app:acme:calendars_list
    ttl: 30m
  - id: slot
    tool: app:acme:calendar_slots_availability_list
    ttl: 10m
  - id: reservation
    tool: app:acme:calendar_slots_reserve
    ttl: 15m

tools:
  - tool: app:acme:clients_search
  - tool: app:acme:calendars_list
    needs: [client]
  - tool: app:acme:calendar_slots_availability_list
    needs: [client, calendars]
  - tool: app:acme:calendar_slots_reserve
    needs: [client, slot]
  - tool: app:acme:calendar_slots_confirm
    needs: [client, reservation]

reply:
  needs: [client]
```

`ttl` is `10m`, `2h`, or `1d`. A phone in the latest user message that differs from the phone stored on the entry expires it. `ownedFields` and `requiredWrites` stay a separate decision: those are fields the model must set. Reading or mirroring a client record is `entity` plus `match` on the memory entry.

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

Event types include `thread.message.*`, `thread.attachment.received`, `thread.participant.*`, `thread.context.changed`, `thread.workflow.*`, and `custom.*`.

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

### `calculateWaitTime` relative `from`

Relative mode accepts an optional `from` (ISO datetime or `Date`) as the base for the delay instead of wall-clock `now`. Use this to chain cadence messages so each step is relative to the previous message’s `scheduledAt`:

```ts
const msg4 = calculateWaitTime(
  {
    mode: 'relative',
    amount: 32,
    unit: 'hours',
    windows: [{ days: ['monday' /* … */], startTime: 12, endTime: 20, timezone: 'Australia/Melbourne' }],
  },
  workflowStart,
)

const msg5 = calculateWaitTime(
  {
    mode: 'relative',
    amount: 28,
    unit: 'hours',
    from: msg4.scheduledAt, // gap after msg4, not after workflow start
    windows: [{ days: ['monday' /* … */], startTime: 14, endTime: 20, timezone: 'Australia/Melbourne' }],
  },
  workflowStart,
)
```

`waitTime` is always milliseconds from wall-clock `now` until `scheduledAt` (for Temporal sleeps). Without `from`, relative delays use `now` as the base (cumulative-from-start cadences).

In workflow YAML, `skedyul/threads` `message.send` schedule input supports the same field:

```yaml
schedule:
  mode: relative
  unit: hours
  amount: 28
  from: "{{ steps.cadence-message-4.outputs.response.scheduledAt }}"
  windows:
    - days: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
      startTime: 14
      endTime: 20
      timezone: Australia/Melbourne
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
