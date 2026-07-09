# Package exports

Subpath exports from the `skedyul` npm package (`package.json` `exports` field).

---

## Main entry — `skedyul`

```ts
import {
  server,
  defineConfig,
  definePage,
  z,
  instance,
  event,
  file,
  ai,
  token,
  webhook,
  createSuccessResponse,
  // ...
} from 'skedyul'
```

| Condition | Path |
|-----------|------|
| Types | `dist/index.d.ts` |
| ESM | `dist/esm/index.mjs` |
| CJS | `dist/index.js` |

Default import for SDK APIs, config helpers, Core API clients, Zod re-export, and types.

---

## Server runtimes

### `skedyul/serverless`

Serverless (Lambda) entry point:

```ts
import { handler } from 'skedyul/serverless'
```

Types: `dist/server.d.ts`  
Import: `dist/serverless/server.mjs`

### `skedyul/dedicated`

Dedicated container HTTP server:

```ts
import { /* dedicated server */ } from 'skedyul/dedicated'
```

Types: `dist/server.d.ts`  
Require: `dist/dedicated/server.js`

Integration apps typically use `server.create()` from the main entry and build their own `mcp_server.ts` rather than importing these directly.

---

## Config loader — `skedyul/config/loader`

```ts
import { /* config loader */ } from 'skedyul/config/loader'
```

Used by CLI and build tooling to load `skedyul.config.ts`. Rarely needed in integration app code.

| Condition | Path |
|-----------|------|
| Types | `dist/config/loader.d.ts` |
| ESM | `dist/config/loader.mjs` |
| CJS | `dist/config/loader.js` |

---

## Agent schemas

### `skedyul/schemas/agent-schema`

Agent YAML v2 validation:

```ts
import { validateAgentYAML, AgentYAMLSchema } from 'skedyul/schemas/agent-schema'
```

### `skedyul/schemas/agent-schema-v3`

Agent YAML v3 validation:

```ts
import { validateAgentYAMLV3, AgentYAMLV3Schema } from 'skedyul/schemas/agent-schema-v3'
```

Each export provides ESM (`.mjs`) and CJS (`.js`) with matching `.d.ts` types.

---

## Skills types — `skedyul/skills/types`

```ts
import type { SkillYAML } from 'skedyul/skills/types'
import { defineSkill, validateSkillYAML } from 'skedyul'  // helpers on main entry
```

Type definitions for skill YAML v2. Validation helpers are on the main entry.

---

## Scheduling — `skedyul/scheduling`

Workflow-safe scheduling utilities (usable in Temporal workflows):

```ts
import {
  calculateWaitTime,
  isTimeInWindowSlot,
  isTimeInWindowPolicy,
  TimeWindowBehaviorSchema,
  TimeWindowPoliciesSchema,
} from 'skedyul/scheduling'
```

| Condition | Path |
|-----------|------|
| Types | `dist/scheduling/index.d.ts` |
| ESM | `dist/scheduling/index.mjs` |
| CJS | `dist/scheduling/index.js` |

---

## Estimation — `skedyul/estimation`

Re-exports estimation types and helpers from the main bundle:

```ts
import {
  createEstimation,
  createMoneyMinorRange,
  formatMoneyMinorEstimate,
  parseEstimationFromBilling,
  EstimationSchema,
} from 'skedyul/estimation'
```

Types resolve to `dist/types/estimation.d.ts`. Runtime resolves to the main entry (`dist/esm/index.mjs` / `dist/index.js`).

Convenience alias — same symbols are also available from `skedyul`.

---

## CLI auth utils — `skedyul/cli/utils/auth`

```ts
import { /* auth helpers */ } from 'skedyul/cli/utils/auth'
```

Internal CLI authentication utilities. Both `skedyul/cli/utils/auth` and `skedyul/cli/utils/auth.js` resolve to the same CJS module.

---

## CLI binary

```bash
npx skedyul --help
```

Bin entry: `dist/cli/index.js` (declared in `package.json` `bin`).

---

## Quick reference

| Import path | Use for |
|-------------|---------|
| `skedyul` | Everything — tools, config, Core API, server, agents, estimation |
| `skedyul/serverless` | Lambda handler template |
| `skedyul/dedicated` | Container server template |
| `skedyul/config/loader` | Config file loading (CLI/build) |
| `skedyul/schemas/agent-schema` | Agent YAML v2 |
| `skedyul/schemas/agent-schema-v3` | Agent YAML v3 |
| `skedyul/skills/types` | Skill YAML types |
| `skedyul/scheduling` | Time windows, wait calculation |
| `skedyul/estimation` | Cost estimate types/formatters |
| `skedyul/cli/utils/auth` | CLI auth (internal) |

---

## Related docs

- [Main README](../README.md) — installation and quick start
- [Estimation and billing](./estimation-and-billing.md) — `Estimation` type details
- [Agents, skills & workflows](./agents.md) — schema validation usage
