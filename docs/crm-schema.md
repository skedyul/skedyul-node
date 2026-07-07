# CRM schema

Workplace-level CRM schemas define models, fields, and relationships for a workplace's data layer. This is separate from **app provision models** (`defineModel` in `skedyul.config.ts`) — CRM schemas are managed per workplace and support migrations.

Use the SDK's `defineSchema` helper and the `skedyul crm` CLI commands.

## When to use which

| Approach | Scope | Managed by | Use case |
|----------|-------|------------|----------|
| **Provision models** | App version | App deploy | App-owned internal data, shared model mappings |
| **CRM schema** | Workplace | `skedyul crm push` | Workplace-native CRM structure, migrations |

---

## Defining a schema

```ts
// gym.schema.ts
import { defineSchema } from 'skedyul'

export default defineSchema({
  models: [
    {
      handle: 'member',
      label: 'Member',
      labelPlural: 'Members',
      fields: [
        {
          handle: 'name',
          label: 'Name',
          type: 'string',
          required: true,
        },
        {
          handle: 'email',
          label: 'Email',
          type: 'string',
          required: false,
        },
        {
          handle: 'joined_at',
          label: 'Joined',
          type: 'datetime',
          required: false,
        },
        {
          handle: 'photo',
          label: 'Photo',
          type: 'image',
          required: false,
        },
      ],
    },
    {
      handle: 'membership',
      label: 'Membership',
      labelPlural: 'Memberships',
      fields: [
        {
          handle: 'plan',
          label: 'Plan',
          type: 'string',
          required: true,
          definition: {
            limitChoices: 1,
            options: [
              { label: 'Basic', value: 'basic' },
              { label: 'Premium', value: 'premium' },
            ],
          },
        },
        {
          handle: 'member',
          label: 'Member',
          type: 'string',
          required: true,
        },
      ],
    },
  ],
  relationships: [
    {
      source: {
        model: 'membership',
        field: 'member',
        label: 'Member',
        cardinality: 'many_to_one',
        onDelete: 'restrict',
      },
      target: {
        model: 'member',
        field: 'memberships',
        label: 'Memberships',
        cardinality: 'one_to_many',
        onDelete: 'none',
      },
    },
  ],
})
```

---

## Field types

CRM schema supports a broader type set than provision models:

| Type | Description |
|------|-------------|
| `string` | Short text |
| `long_string` | Long text |
| `number` | Numeric |
| `boolean` | True/false |
| `date` | Date only |
| `datetime` | Date and time |
| `time` | Time only |
| `file` | File attachment |
| `image` | Image attachment |
| `object` | Nested JSON object |

---

## Validation

```ts
import {
  defineSchema,
  validateCRMSchema,
  parseCRMSchema,
  safeParseCRMSchema,
} from 'skedyul'

// Throws on invalid schema
const schema = parseCRMSchema(rawObject)

// Returns { success, data } or { success, error }
const result = safeParseCRMSchema(rawObject)

// Validate and get detailed errors
const validation = validateCRMSchema(schema)
```

---

## CLI commands

### Push schema (with migrations)

```bash
skedyul crm push --schema ./gym.schema.ts --workplace demo-clinic
```

Applies schema changes to the workplace. Destructive changes require migration approval unless `--yes` is passed.

```bash
skedyul crm push --schema ./gym.schema.ts --workplace demo-clinic --dry-run
skedyul crm push --schema ./gym.schema.ts --workplace demo-clinic --yes
```

### Preview changes

```bash
skedyul crm diff --schema ./gym.schema.ts --workplace demo-clinic
```

Shows added/removed/changed models and fields before pushing.

### Pull current schema

```bash
# JSON
skedyul crm pull --workplace demo-clinic --output ./current.schema.json

# TypeScript
skedyul crm pull --workplace demo-clinic --format ts --output ./gym.schema.ts
```

### List models

```bash
skedyul crm models --workplace demo-clinic
```

---

## Schema loader utilities

For programmatic read/write (used by CLI and tooling):

```ts
import { loadSchema, saveSchema, transformToBackendSchema } from 'skedyul/config/schema-loader'
```

These transform between SDK schema format and the backend representation.

---

## Migrations

When you push schema changes, the platform computes a migration plan:

- **Additive changes** (new models, new optional fields) apply automatically
- **Destructive changes** (remove fields, change types) require explicit approval
- Use `skedyul crm diff` to review before pushing

The CLI prompts for migration approval interactively. In CI, use `--yes` only when you've reviewed the diff output.

---

## Working with instances

After schema push, use the Core API or CLI to manage data:

```bash
skedyul instances list member --workplace demo-clinic
skedyul instances create member --data '{"name":"Jane"}' --workplace demo-clinic
```

```ts
import { instance } from 'skedyul'

const { data } = await instance.list('member', { filter: { name: 'Jane' } })
const member = await instance.create('member', { name: 'Jane', email: 'jane@example.com' })
```

See [Core API — instance](./core-api.md#instance) for batch operations (`createMany`, `upsertMany`, etc.).

---

## Best practices

1. **Version control your schema file** — treat `gym.schema.ts` as source of truth
2. **Always diff before push** — `skedyul crm diff` in CI before `crm push --yes`
3. **Use snake_case handles** — `membership_plan`, not `membershipPlan`
4. **Prefer additive migrations** — add new fields as optional before making them required
5. **Separate app models from workplace schema** — app internal models belong in `provision.ts`, workplace CRM in schema files

---

## Related docs

- [Configuration — Models](./configuration.md#models) — app provision `defineModel`
- [CLI — CRM & instances](./cli.md#crm-schema-skedyul-crm)
- [Core API](./core-api.md)
