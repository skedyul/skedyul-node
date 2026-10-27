# Agents, skills & workflows

Skedyul supports two agent configuration models plus YAML-based skills and event-driven workflows.

## Overview

| Model | Where defined | Deployed via | Use case |
|-------|---------------|--------------|----------|
| **Provision agents** | `skedyul.config.ts` → `defineAgent()` | App version deploy | Simple multi-tenant agents bound to app tools |
| **Agent YAML v3** | `agents/*.yaml` | `skedyul agents deploy` | Skills-based autonomous agents per workplace |
| **Skills** | `skills/*.yaml` | `skedyul skills deploy` | Reusable capability bundles that own tools. Pass `--app <appId>` for an app-owned skill. |
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

behavior:
  persona:
    name: Alex
    voice: Warm, concise, professional
  message:
    maxChars: 320
    emojis: false

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
| `skills` | Skill references — skills own the tool definitions. A workplace skill is a bare handle (`booking`). A skill from an installed app is `@app-handle/skills/skill-handle` (for example `@acme/skills/booking`). Set `alwaysLoad: true` to pre-seed that skill before the first model step; otherwise the agent calls `system:skill:load`. |
| `tools` | Bootstrap tools always available (e.g. `system:skill:load`). A tool may be a name or `{ tool, description?, fields?, where? }`. `fields` is the CRM list projection: those field handles are hydrated. Omit `fields` to hydrate every field. `where` is a base filter locked onto every list, count or aggregate call, for example `{ active: { eq: true } }`; the model's own filter is ANDed with it. |
| `prompts` | `system` and `titleEnrichment`. `recovery` and `followUp` parse and are marked not implemented. |
| `behavior` | How the agent talks: timezone, persona, message rules, response limits, conversation policy, scheduling, time windows and time gaps. See [Behavior](#behavior) |
| `settings` | Install-scoped values that templates reference with Liquid. See [Settings](#settings) |
| `policies` | Message/tool approval requirements. The only home for approvals |
| `runtime` | `model` and `personaModel` LLM selection, and `maxIterations` (model steps per run, `1`–`50`, default `10`) |
| `routing` | Harness skill routing: a router step picks the turn's skills from `skills[].description`, Liquid `guidance`, and the conversation. See [Routing](#routing) |
| `sandbox` | Sandbox testing context. `sandbox.enabled` parses and is marked not implemented — the caller chooses sandbox mode. |

Skill `evaluators:` (on the skill YAML, not the agent) are quality rubrics for that skill's replies and writes. The agent owns only turn-level `target: skill` routing evaluators.

### Behavior

Everything about how the agent talks lives under `behavior`, each rule declared once:

```yaml
behavior:
  timezone: "{{ STUDIO_TIMEZONE }}"
  persona:
    name: "{{ STUDIO_MANAGER_NAME }}"
    voice: A mate on the front desk. Short, warm, plain.
  message:
    maxChars: 480
    maxQuestions: 1
    emojis: false
    signOffs: false
    bullets: strip
    dashes: comma
    plainPunctuation: true
  responses: { maxImmediate: 1, requireFinal: true }
  conversation: { exampleCopy: reject }
  timeGaps: { acknowledge: true, threshold: 7d }
  scheduling: { defaults: { timeWindow: business_hours } }
  timeWindows: { ... }
  timeWindowDefault: { responseMode: immediate }
```

`behavior.timezone` is the agent's clock and the timezone for any window that omits one. `behavior.persona` sets the name and voice the outbound text is rewritten in; a name that renders blank means the agent gives itself no name.

`behavior.message` holds the rules every outbound message follows. Each rule is stated once in the prompt and applied to the text before it is sent:

| Key | Default | Meaning |
|-----|---------|---------|
| `maxChars` | none | Longest message. Longer text is cut, keeping the question |
| `maxQuestions` | none | Most questions per message. A send that asks more is rejected and rewritten |
| `emojis` | `true` | `false` strips emojis |
| `signOffs` | `true` | `false` strips a trailing sign-off line |
| `bullets` | `keep` | `dash` turns bullet leaders into "- ", `strip` removes them |
| `dashes` | `keep` | `comma` turns em and en dashes into commas, `strip` removes them |
| `plainPunctuation` | `false` | Straight quotes, three-dot ellipsis, no space before punctuation |
| `spelling` | none | Locale tag stated to the model. The text is not rewritten. `en-AU` is Australian English; `en-GB`, `en-US`, `en-CA`, and `en-NZ` are named the same way. Any other tag, such as `fr-FR`, is "Write in fr-FR." |

`behavior.timeGaps.acknowledge` (`false` by default) mentions a long gap since the last message. `threshold` is that gap, for example `"3 days"`.

`behavior.scheduling.defaults.timeWindow` is the one default window for scheduled sends. A window's `behavior.scheduleFor`, `timeWindowDefault.scheduleFor` and a pattern's `defaultDelay.timeWindow` inherit it unless they name another window.

#### Older keys

Older agents spread these rules across other keys. They still work: new keys win, and the deploy output warns when an old and a new key disagree.

| Old key | Use instead |
|---------|-------------|
| `persona.name`, `persona.voice.style` | `behavior.persona.name`, `behavior.persona.voice` |
| `persona.voice.format.maxChars` | `behavior.message.maxChars` |
| `persona.voice.format.maxQuestionsPerMessage`, `behavior.conversation.oneQuestionPerMessage` | `behavior.message.maxQuestions` |
| `persona.voice.format.noEmojis` / `noSignOffs` | `emojis: false` / `signOffs: false` |
| `persona.voice.format.noBulletPoints` / `noHyphens` | `bullets: strip` / `dashes: strip` |
| `behavior.responses.humanize` | `bullets: dash`, `dashes: comma`, `plainPunctuation: true` |
| `behavior.responses.maxIntermediate` | `behavior.responses.maxImmediate` |
| `behavior.conversation.oneMessagePerTurn` | Stated whenever `responses.maxImmediate` is `1` |
| `behavior.acknowledgeTimeGaps`, `behavior.timeGapThreshold` | `behavior.timeGaps.acknowledge`, `.threshold` |
| `behavior.scheduling.defaults.requiresApproval` | `policies.messages.schedule.requiresApproval` |
| top-level `timeWindows`, `timeWindowDefault` | `behavior.timeWindows`, `behavior.timeWindowDefault` |

`behavior.responses` limits how the agent sends:

| Key | Default | Meaning |
|-----|---------|---------|
| `maxImmediate` / `maxScheduled` / `requireFinal` | | Budgets and whether a final message is required |
| `allowSilent` | `false` | The agent may call `system:message:skip` |
| `allowSchedule` | `false` | The agent may schedule a future send |
| `responseGate.enabled` | on when `allowSilent` is set | Treat a bare acknowledgement as a reason to skip |
| `responseGate.strictMode` | `false` | Block the send instead of recommending a skip |
| `responseGate.minAckConfidence` | `0.7` | Confidence required to call a message an acknowledgement (`0`–`1`) |

`behavior.conversation` declares which cross-turn rules this agent wants. Each rule is `off` (not stated, not checked), `prompt` (stated, never blocks), or `reject` (the send is rejected and the model rewrites it). No level ends the run. Every rule defaults to `prompt`.

| Key | What it asks for |
|-----|------------------|
| `repeatQuestions` | Do not re-ask something the customer already answered |
| `exampleCopy` | Do not send skill example wording verbatim |
| `namedDelayFollowUp` | A named delay or a promised check-in should produce a scheduled send |
| `fillerBan` | Skip rather than send filler. Stated only when `allowSilent` is set |
| `cancelPendingOnAck` | A bare acknowledgement does not cancel a pending follow-up |
| `onPolicyRejectExhausted` | `send` (default) releases the last rejected message; `skip` records a skip |

`behavior.responses.messageSplitting` is accepted and marked not implemented.

### Settings

`settings` declares install-scoped values. A setting never prints itself: templates reference it with [Liquid](https://liquidjs.com/) by its exact key.

```yaml
settings:
  - key: STUDIO_MANAGER_NAME
    label: Agent name
  - key: STUDIO_TIMEZONE
    label: Studio timezone
    default: Australia/Sydney
prompts:
  system: |
    {% if STUDIO_MANAGER_NAME %}You are {{ STUDIO_MANAGER_NAME }}.{% else %}Do not give yourself a name.{% endif %}
    This club is {{ STUDIO_NAME | default: workplace.name }}.
```

| Field | Meaning |
|-------|---------|
| `key` | Resolved against the install's agent config and env. Templates use this exact name |
| `label` | Shown in the console and to the grader |
| `default` | Value used when the install leaves the setting blank |

Each declared key holds the install value after `default`; a blank value is `nil`, so `{% if %}` and `| default:` behave as expected. `workplace.name` is the workplace name. Skill and agent text can also read `state.*` paths (`{{ state.memory.scores.engagement_score }}`); unset renders empty, same as a missing setting. Files cannot be included.

Rendered fields: `prompts.system`, `behavior.persona.name`, `behavior.persona.voice`, `behavior.timezone`, each window's `timezone` and `behavior.prompt`, `timeWindowDefault.prompt`, `routing.guidance`, `skills[].description` and `tools[].description`. In skill files: `instructions`, `description`, `tools[].description` and `requires.reason`.

On deploy, a template that fails to parse or names an undeclared variable is an error, and a declared setting nothing references is a warning.

A skill file can declare its own `settings` rows (`key`, `label`, `default`) for values only that skill uses, such as a sales skill's win and loss criteria. They load with the agent's settings, so the install page and playground overrides set them the same way, and `default` fills a blank install value. Only that skill's text can reference them; the agent prompt and other skills cannot. Every skill can reference the agent's settings, so studio-wide values such as the studio name or timezone stay on the agent. When the agent and a skill declare the same key, the agent's row is used.

```yaml
# skills/sales.skill.yml
settings:
  - key: WIN_CRITERIA
    label: Win criteria
    default: They bought a trial pack or membership.
instructions: |
  You sell for {{ STUDIO_NAME }}. Mark the lead won when: {{ WIN_CRITERIA }}
```

Skill settings render only for an agent that uses Liquid setting references.

`guidance`, `emptyGuidance` and `role: persona_name` on a setting row are deprecated. An agent that still uses them and has no Liquid setting references keeps the older behavior, where every setting prints under "Workplace settings". Mixing them with Liquid references is a deploy error.

### Routing

With `routing.enabled`, a router model step runs once per turn, before the main model. It reads the skill descriptions, Liquid `guidance` (with live `state.*` values injected), and the recent messages. It returns `{ skills, reason }` limited to the declared skill handles. The harness loads those skills before the main model runs, and `system:skill:load` is not offered.

```yaml
routing:
  enabled: true
  fallback: [sales]
  guidance: >-
    Determine the customer from membership status:
    {{ state.crm.member.membership_status | default: "empty" }}.
    Use that plus this conversation to pick skills.
```

`routing.guidance` renders at router time so `{{ state.crm… }}` is the current person, not a value baked at deploy. A leftover `signals:` list is ignored.

| Field | Meaning |
|-------|---------|
| `enabled` | Turn on the router step |
| `guidance` | How to pick skills. Router prompt only. Liquid can inject `state.*` |
| `fallback` | Skills loaded when the router returns nothing or fails. Must be declared in `skills` |
| `model` | Router model. Defaults to `runtime.model` |

`guidance` never reaches the main prompt. Write the routing judgement into `guidance` and each `skills[].description`.

### Validation

```ts
import { validateAgentYAMLV3, AgentYAMLV3Schema } from 'skedyul/schemas/agent-schema-v3'

const result = validateAgentYAMLV3(yamlObject)
```

`validateAgentYAMLV3` also checks `routing`: `fallback` may only name declared skills. `validateAgentRouting(agent)` is that same check for callers that already have a parsed agent.

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
| `events.emits`, `events.waits`, `events.cancels`, `events.cancelCondition` | Thread events and workflow bindings. `events.subscribes` and `events.condition` register the agent's event subscriptions |
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

state:
  crm:
    patient:
      track:
        - appointment_time
      see:
        - name
        - phone
  scratchpad:
    own:
      - plan

examples:
  - input: "I need an appointment next Tuesday"
    output: "I can check Tuesday availability. Morning or afternoon?"
```

`state` is the parent for durable skill state. `state.crm` is the person record (filter/sort). `state.memory` is harness-owned thread bags (previous values; the model cannot forge the keys). `state.scratchpad` is model working notes. Verbs: `track` = pull + push, required every turn; `own` = pull + push; `see` = pull only; `set` = push only. Top-level `fields` is a deprecated alias of `state.crm`. `ownedFields` / `requiredWrites` remain as further aliases of `own`/`set` and `track`.

### Skill tool definition (v2)

| Field | Description |
|-------|-------------|
| `tool` | Tool name |
| `description` | Override description for the agent |
| `arguments` | Named JSON Schema properties the model fills. For `system:math:evaluate` this is the input schema (type, description, default, minimum, maximum). |
| `constants` | Numbers or booleans the model never sees. Merged into `math.evaluate` scope; a colliding argument name loses to the constant. |
| `fields` | CRM list field handles to hydrate (for example `name`, `kind`). Omit to hydrate every field. |
| `overrides` | Default input overrides. For `system:math:evaluate`: `expression` (mathjs formula), `assign` (full state path → `$value` or a mathjs expression using `value` and constants). Deprecated: `applyOn` plus short field names. |
| `sandbox.mock` | Mock response for sandbox testing |
| `requiresApproval` | Require human approval before execution |
| `constraints` | `maxCallsPerRun`, `idempotent`, `restricted`, `tags` |
| `needs` | Memory ids that must already be filled before this tool runs |
| `requires` | `path` predicates on a state path (`state.crm…` / `state.memory…`), or legacy `crm` / `entities`, plus a `reason`. A failed condition rejects the call with `reason` |

```yaml
state:
  crm:
    member:
      track: [intent_score]
      own: [is_qualified]
  memory:
    scores:
      ttl: 14d
      track: [engagement_score, transparency_score, readiness_score, intent_score]
tools:
  - tool: app:acme:package:list
    requires:
      path:
        - { path: state.crm.member.is_qualified, op: eq, value: true }
      reason: Not qualified yet. Keep discovering; do not name packs or prices.
  - tool: system:math:evaluate
    description: Compute intent_score (Q) from this turn's pillar scores.
    arguments:
      readiness_score:
        type: number
        minimum: 0
        maximum: 1
      transparency_score:
        type: number
        minimum: 0
        maximum: 1
      engagement_score:
        type: number
        minimum: 0
        maximum: 1
      clearance:
        type: boolean
        default: true
    constants:
      transparency_weight: 0.6
      engagement_weight: 0.4
      qualified_threshold: 0.70
    overrides:
      expression: >-
        round(min(max((clearance == false ? 0 : 1) * readiness_score
        * (transparency_weight * transparency_score + engagement_weight * engagement_score),
        0), 1), 2)
      assign:
        state.memory.scores.intent_score: $value
        state.crm.member.intent_score: $value
        state.crm.member.is_qualified: "$value >= qualified_threshold"
```

`system:math:evaluate` runs `math.evaluate` in the harness (no LLM). The model fills `arguments` (short names); `constants` are merged into scope and win on name collisions. `overrides.expression` is the formula. `assign` keys are full state paths: memory paths write on evaluate success; CRM paths merge into this turn's one entity update. Dual-write is listing both destinations. Omitting a pillar argument holds the previous memory value (0 on the first turn). Deprecated: short-key `assign` plus `overrides.applyOn`.

`op` is `eq`, `in` (array `value`), `empty`, or `notEmpty`. `{ entity, field }` still means `state.crm.<entity>.<field>`.

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

### Reply contract

A turn has one reply, and the platform owns it. `system:message:send`, `system:message:skip`, and `system:scratchpad:*` are turn tools: the platform registers them on every customer-facing turn with its own descriptions. Do not list them in a skill's `tools`; a listed copy is ignored and validation warns (`skillTurnToolWarnings`). Write reply wording in `instructions`.

A skill shapes the reply with conditions. Every loaded skill's conditions must pass before the send goes out:

| Key | Condition |
|-----|-----------|
| `requiredWrites` | These fields were written this turn |
| `reply.needs` | These memory ids are filled |
| `reply.requires` | These `crm` conditions hold on the turn-start record; otherwise the send is rejected with `reason` |

```yaml
reply:
  requires:
    crm:
      - { entity: member, field: offer_made, op: notEmpty }
    reason: No offer has been made yet. Keep qualifying instead of sending next steps.
```

`reply.requires` uses the same predicate shape as tool `requires`, and its `entity` must be in `entityPolicies`. A rejected send is guidance: the model rewrites or does the missing work, and the run continues.

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

Agent v3 `behavior.timeWindows` define named policies referenced in `behavior.scheduling`. A window without `timezone` uses `behavior.timezone`. Re-exported Zod schemas: `TimeWindowBehaviorSchema`, `TimeWindowPoliciesSchema`.

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
