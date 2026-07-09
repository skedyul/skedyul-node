---
name: integration-provision
description: |
  Use when editing provision config: defineModel, definePage, defineNavigation,
  defineEnv, ProvisionConfig aggregation, relationships, and page blocks.
---

# Integration Provision

## SDK docs

- `node_modules/skedyul/docs/configuration.md` — models, pages, navigation, env, relationships
- `node_modules/skedyul/docs/crm-schema.md` — shared model mapping

## ProvisionConfig aggregator

`src/provision/index.ts` (or `provision.ts`) exports `default`:

```ts
import type { ProvisionConfig } from 'skedyul'
import env from './env'
import navigation from './pages/navigation'
import relationships from './relationships'
import accessRequest from './models/access-request'
import studio from './models/studio'
import requestAccessPage from './pages/request-access'

const config: ProvisionConfig = {
  env,
  navigation,
  relationships,
  models: [accessRequest, studio],
  pages: [requestAccessPage, /* ... */],
  // channels: Object.values(channels),  // if using defineChannel
  // signals: [...],                   // install-time workflow subscriptions
}

export default config
```

Wire in config: `provision: import('./src/provision')`

## defineEnv (`provision/env.ts`)

```ts
import { defineEnv } from 'skedyul'

export default defineEnv({
  GLOFOX_API_KEY: {
    label: 'Glofox API Key',
    scope: 'provision',       // 'provision' | 'install'
    required: true,
    visibility: 'encrypted',  // 'visible' | 'encrypted'
    description: 'API key from Glofox',
  },
})
```

- `provision` scope: collected at app version deploy (shared across installs)
- `install` scope: collected per workplace installation

## defineModel

```ts
import { defineModel } from 'skedyul'

export default defineModel({
  handle: 'studio',
  label: 'Studio',
  scope: 'internal',          // 'internal' | 'shared'
  fields: [
    { handle: 'name', label: 'Studio Name', type: 'string', requirement: 'required' },
    { handle: 'status', label: 'Status', type: 'string', owner: 'app',
      definition: { options: [{ value: 'ACTIVE', label: 'Active', color: 'green' }] } },
  ],
})
```

- `internal` — app-owned (BFT `studio`); `shared` — user-mapped (Vetnostics `test_report`)

## definePage

```ts
export default definePage({
  handle: 'request_access',
  label: 'Request Access',
  type: 'instance',
  path: '/request-access',
  navigation: true,
  blocks: [{
    type: 'card',
    form: {
      fields: [{ component: 'input', id: 'studio_name', label: 'Studio Name', row: 0, col: 0 }],
      actions: [{ handle: 'submit', label: 'Submit', handler: 'request_access', variant: 'primary' }],
    },
  }],
})
```

Form `handler` must match a `toolRegistry` key.

## defineNavigation

```ts
export default defineNavigation({
  context: { studio: { model: 'studio', mode: 'first', filters: { status: { equals: 'ACTIVE' } } } },
  sidebar: { sections: [{ items: [
    { label: 'Request Access', href: '/request-access', icon: 'Building2' },
    { label: 'Members', href: '/members', icon: 'Users', hidden: '{{ studio == blank }}' },
  ]}]},
})
```

Relationships use `RelationshipDefinition[]` with `many_to_one` / `one_to_many` cardinality (see `configuration.md`).

## Reference examples (read-only)

- **BFT** `private-integrations/integrations/bft/src/provision/` — internal models, conditional nav, developer pages
- **Vetnostics** `private-integrations/integrations/vetnostics/src/provision/` — shared models, single pathology page
- **Public email** `integrations/integrations/email/` — channels + install-scoped models

## Anti-patterns

- **Do not edit reference clones**
- **Do not use `workspace:*` for `skedyul`**
- **Only edit `projectDirectory`**
- **Do not use SCREAMING_CASE for cardinality** — use `many_to_one`, not `MANY_TO_ONE`
- **Do not reference tools/pages that don't exist** — run `skedyul dev validate`
- **Do not put env vars in `skedyul.config.ts`** — use `defineEnv` in provision
- **Do not duplicate handles** across models, pages, or tools

## Validate

```bash
pnpm exec skedyul dev validate
pnpm build
```
