# CRM schema

Workplace-level CRM schemas define models, fields, and relationships for a workplace's data layer. This is separate from **app provision models** (`defineModel` in `skedyul.config.ts`) — CRM schemas are managed per workplace and support migrations.

Use the SDK's `defineSchema` helper and the `skedyul crm` CLI commands.

The canonical on-the-wire format is JSON matching `$schema: "https://skedyul.com/schemas/crm/v1"`. **Download / pull and upload / push use the same public shape** — a file you download from the admin console can be uploaded again (or pushed via CLI) without transformation.

## When to use which

| Approach | Scope | Managed by | Use case |
|----------|-------|------------|----------|
| **Provision models** | App version | App deploy | App-owned internal data, shared model mappings |
| **CRM schema** | Workplace | `skedyul crm push` / UI upload | Workplace-native CRM structure, migrations |

---

## Defining a schema

```ts
// gym.schema.ts
import { defineSchema } from 'skedyul'

export default defineSchema({
  name: 'Gym CRM',
  description: 'Members and memberships',
  models: [
    {
      handle: 'member',
      name: 'Member',
      namePlural: 'Members',
      labelTemplate: '{{ name }}',
      fields: [
        {
          handle: 'name',
          label: 'Name',
          type: 'string',
          requirement: 'required',
          section: 'profile',
        },
        {
          handle: 'email',
          label: 'Email',
          type: 'string',
          requirement: 'optional',
          definition: 'email',
          unique: true,
          aiMeta: {
            description: "Person's email address",
            mutability: 'restricted',
          },
        },
        {
          handle: 'joined_at',
          label: 'Joined',
          type: 'datetime',
          requirement: 'optional',
        },
        {
          handle: 'photo',
          label: 'Photo',
          type: 'image',
          requirement: 'optional',
        },
      ],
    },
    {
      handle: 'membership',
      name: 'Membership',
      namePlural: 'Memberships',
      fields: [
        {
          handle: 'plan',
          label: 'Plan',
          type: 'string',
          requirement: 'required',
          definition: {
            limitChoices: 1,
            options: [
              { label: 'Basic', value: 'basic' },
              { label: 'Premium', value: 'premium' },
            ],
          },
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
      },
      target: {
        model: 'member',
        field: 'memberships',
        label: 'Memberships',
      },
      cardinality: 'many_to_one',
      onDelete: 'restrict',
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

### Field requirement

Use `requirement` (not a boolean `required` flag):

| Value | Meaning |
|-------|---------|
| `optional` | Not required |
| `on_create` | Required when creating a record |
| `required` | Always required |

Downloaded schemas always include `requirement` on every field so upload can round-trip without guessing defaults.

### Field sections (visualization)

Optional `section` on a field is a workplace-scoped handle used only to organize fields in CRM UI lists (model node, list-page column chips, Add Field menu). It does not affect forms, validation, or queries.

```ts
{
  handle: 'first_name',
  label: 'First Name',
  type: 'string',
  section: 'profile', // find-or-create; display name defaults to "Profile"
}
```

- Pass the handle only; on first use the section is created with a title-cased name.
- Rename the display name later in the field editor (**Edit Field Section**); the rename applies to every field using that section.
- Omitting `section` leaves the field unsectioned (shown above collapsed sections in the UI).
- Download includes `section` when set so re-upload does not clear sections.

### AI metadata

Optional `aiMeta` on a field:

```ts
{
  handle: 'email',
  label: 'Email',
  type: 'string',
  aiMeta: {
    description: "Person's email address for contact",
    mutability: 'restricted', // always | restricted | create_only | immutable
  },
}
```

### Relationships

| Property | Values |
|----------|--------|
| `cardinality` | `one_to_one`, `one_to_many`, `many_to_one`, `many_to_many` |
| `onDelete` | `none` (default), `cascade`, `restrict`, `set_null` |

`source` / `target` each have `model`, `field`, and `label`. Cardinality is on the relationship object (from the source side). Download omits `onDelete` when it is `none`.

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

The CLI sends the **public v1 schema JSON** (the same shape as UI Download / Upload). No backend key renaming (`list` stays `list`, not `isList`).

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

Pulled files are upload-compatible: re-push or UI upload should not drop `requirement`, `section`, `aiMeta`, `list`, `unique`, or `default`.

### List models

```bash
skedyul crm models --workplace demo-clinic
```

---

## Schema loader utilities

For programmatic read/write (used by CLI and tooling):

```ts
import { loadSchema, saveSchema } from 'skedyul/config/schema-loader'
```

`loadSchema` / `saveSchema` work with the public CRM v1 format. Prefer that for push/pull flows.

`transformToBackendSchema` is deprecated — the platform API accepts public v1 JSON directly.

---

## Migrations

When you push schema changes, the platform computes a migration plan:

- **Additive changes** (new models, new optional fields) apply automatically
- **Destructive changes** (remove fields, change types) require explicit approval
- Use `skedyul crm diff` to review before pushing

The CLI prompts for migration approval interactively. In CI, use `--yes` only when you've reviewed the diff output.

Pages and navigation in a schema file are accepted for compatibility but are **not** applied or exported (they are UI-managed).

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

1. **Version control your schema file** — treat `gym.schema.ts` / `.schema.json` as source of truth
2. **Always diff before push** — `skedyul crm diff` in CI before `crm push --yes`
3. **Use snake_case handles** — `membership_plan`, not `membershipPlan`
4. **Prefer additive migrations** — add new fields as optional before making them required
5. **Separate app models from workplace schema** — app internal models belong in provision config, workplace CRM in schema files
6. **Re-download after platform export fixes** — older downloads that omitted `requirement` / `section` are not preserved; pull a fresh file

---

## Related docs

- [Configuration — Models](./configuration.md#models) — app provision `defineModel`
- [CLI — CRM & instances](./cli.md#crm-schema-skedyul-crm)
- [Core API](./core-api.md)
