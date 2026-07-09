# Developer tools (`executionScope: 'app_version'`)

App-owner admin tools that run at **app version** scope — not tied to a single workplace installation. Based on **BFT** (`packages/skedyul-integrations/private/integrations/bft`).

Use `executionScope: 'app_version'` when:

- Only the app developer (not workplace users) should call the tool
- The tool must discover which installation to act on from CRM records
- Writes need a workplace-scoped token obtained via `token.exchange`

---

## Execution scopes

| Scope | Token | `appInstallationId` | Use case |
|-------|-------|---------------------|----------|
| `installation` (default) | `sk_wkp_*` | Required | Workplace user tools (request access, fetch members) |
| `app_version` | `sk_prv_*` | Not passed | Developer admin tools (approve, activate, revoke) |

From the SDK:

> **`installation`** — requires `appInstallationId`, receives workplace token.
>
> **`app_version`** — no `appInstallationId`; handler discovers it from records and uses `token.exchange` for scoped writes.

---

## BFT developer tool inventory

| Tool | Scope | Purpose |
|------|-------|---------|
| `request_access` | `installation` | Workplace user submits access request |
| `get_members` | `installation` | Fetch Glofox members for active studio |
| `approve_access` | `app_version` | Create studio, generate Glofox email |
| `activate_studio` | `app_version` | Mark studio ACTIVE after Glofox confirms |
| `deny_access_request` | `app_version` | Reject pending request |
| `revoke_access` | `app_version` | Deactivate studio access |

Install-scope tools use `context.env` (workplace secrets) and `instance.*` with the caller's installation context. Developer tools use global `instance.*` to discover records, then `token.exchange` for writes.

---

## Declaring `executionScope`

```ts
export const approveAccessRegistry: ToolDefinition<Input, Output> = {
  name: 'approve_access',
  label: 'Approve Access',
  description: 'Prepare a pending access request...',
  inputSchema: ApproveAccessInputSchema,
  outputSchema: ApproveAccessOutputSchema,
  timeout: 60000,
  executionScope: 'app_version',
  handler: async (input) => { /* ... */ },
}
```

The scope is serialized into tool metadata at build time. The platform enforces token type and omits `appInstallationId` from the execution context.

---

## Pattern: discover → exchange → write

All BFT developer tools follow the same three-step flow.

### 1. Discover record with global instance API

```ts
// By ID
const accessRequest = await instance.get('access_request', accessRequestId)

// Or find first matching
const { data: pendingList } = await instance.list('access_request', {
  filter: { status: { eq: 'PENDING' } },
  limit: 1,
})
```

Global `instance` calls work with `sk_prv_` because records store `appInstallationId`.

### 2. Exchange for scoped client

```ts
if (!accessRequest.appInstallationId) {
  return createValidationError(
    'Access request is missing appInstallationId. Cannot exchange token for scoped writes.',
  )
}

const scopedInstance = await token.exchange(accessRequest.appInstallationId)
```

`token.exchange` returns an `InstanceClient` bound to that workplace installation. All CRM writes through it are scoped correctly.

For non-CRM calls (e.g. emitting events), use `token.exchangeRaw` + `runWithConfig`:

```ts
const { token: scopedToken } = await token.exchangeRaw(appInstallationId)
const { baseUrl } = getConfig()

await runWithConfig({ baseUrl, apiToken: scopedToken }, async () => {
  await event.create(eventName, payload, { app: 'bft' })
})
```

### 3. Write with scoped instance

```ts
const studio = await scopedInstance.create('studio', {
  name: accessRequest.studio_name,
  branch_id: branchId,
  status: 'PENDING_ACTIVATION',
  access_request_id: accessRequest.id,
})

await scopedInstance.update('access_request', accessRequest.id, {
  status: 'AWAITING_GLOFOX',
  studio_id: studio.id,
})
```

---

## Example: `approve_access`

Full flow from BFT:

1. Find `access_request` with `status: PENDING` (by ID or first match)
2. Validate `appInstallationId` is present
3. `token.exchange(appInstallationId)` → scoped client
4. Get provision webhook URL for Glofox email body
5. `scopedInstance.create('studio', { status: 'PENDING_ACTIVATION', ... })`
6. `scopedInstance.update('access_request', { status: 'AWAITING_GLOFOX' })`
7. Return email text + `effect.redirect` to studio detail page

```ts
return createSuccessResponse(
  {
    access_request_id: accessRequest.id,
    studio_id: studio.id,
    status: 'AWAITING_GLOFOX',
    glofox_setup_email: glofoxSetupEmail,
    instructions: 'Copy the email and send to Glofox...',
  },
  {
    effect: {
      redirect: `/studios/${studio.id}`,
    },
  },
)
```

---

## Example: `activate_studio`

Activates a studio after Glofox attaches the branch to the shared webhook:

```ts
export const activateStudioRegistry: ToolDefinition<...> = {
  name: 'activate_studio',
  executionScope: 'app_version',
  handler: async (input) => {
    // Find PENDING_ACTIVATION studio (by ID or first match)
    const studio = /* ... */

    const scopedInstance = await token.exchange(studio.appInstallationId)

    await scopedInstance.update('studio', studio.id, {
      status: 'ACTIVE',
      activated_at: new Date().toISOString(),
    })

    if (studio.access_request_id) {
      await scopedInstance.update('access_request', studio.access_request_id, {
        status: 'APPROVED',
        resolved_at: activatedAt,
      })
    }

    return createSuccessResponse(output, {
      effect: { redirect: `/studios/${studio.id}` },
    })
  },
}
```

---

## Developer pages (`audience: 'developer'`)

Developer tools are wired to admin pages the app owner sees in the developer console.

```ts
// src/provision/pages/access-request-detail.ts
export default definePage({
  handle: 'access-request-detail',
  path: '/access_requests/[id]',
  audience: 'developer',
  type: 'instance',

  context: {
    request: {
      model: 'access_request',
      mode: 'first',
      filters: { id: { equals: '{{ path_params.id }}' } },
    },
  },

  actions: [
    {
      handle: 'approve',
      label: 'Prepare Access',
      handler: 'approve_access',        // matches registry key
      variant: 'primary',
      isHidden: "{{ request.status != 'PENDING' }}",
    },
    {
      handle: 'deny',
      label: 'Reject',
      handler: 'deny_access_request',
      variant: 'destructive',
      isHidden: "{{ request.status != 'PENDING' }}",
    },
  ],
})
```

BFT developer pages:

| Page | Path | Tools |
|------|------|-------|
| Access Requests List | `/access_requests` | — (list only) |
| Access Request Detail | `/access_requests/[id]` | `approve_access`, `deny_access_request` |
| Studios List | `/studios` | — |
| Studio Detail | `/studios/[id]` | `activate_studio`, `revoke_access` |

Install-audience pages (`request_access`, `get_members`) are separate — workplace users never see developer pages.

---

## Instance CRUD patterns

### List with filters

```ts
const { data: studioList } = await instance.list('studio', {
  filter: { status: 'ACTIVE' },
  limit: 1,
})
```

### Get by ID

```ts
const studio = await instance.get('studio', studioId)
```

### Create / update (scoped)

```ts
const scoped = await token.exchange(appInstallationId)
await scoped.create('studio', { /* fields */ })
await scoped.update('access_request', id, { status: 'DENIED' })
```

### Idempotency

BFT `request_access` checks for existing PENDING/APPROVED requests before creating:

```ts
const { data: existing } = await instance.list('access_request', {
  filter: { status: { in: ['PENDING', 'AWAITING_GLOFOX', 'APPROVED'] } },
  limit: 1,
})
if (existing.length > 0) {
  return createSuccessResponse({ success: true, access_request_id: existing[0].id, ... })
}
```

Apply the same pattern in developer tools when retrying is likely.

---

## Token exchange checklist

- [ ] Record has `appInstallationId` (platform sets this on installation-scoped records)
- [ ] Validate `appInstallationId` before exchange — return `createValidationError` if missing
- [ ] Use `token.exchange` for CRM writes (`instance.create/update/delete`)
- [ ] Use `token.exchangeRaw` + `runWithConfig` for other scoped APIs (`event.create`, etc.)
- [ ] Never write to another workplace's data without exchanging first

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Developer tool without `executionScope: 'app_version'` | Platform passes wrong token; global reads may work but writes fail |
| Writing with global `instance` after discovering another workplace's record | Always `token.exchange` first |
| Developer page with `audience: 'install'` | Workplace users see admin actions they shouldn't |
| Missing `appInstallationId` on model | Ensure model is created in installation context or copy ID from parent record |

---

## Related docs

- [Project structure](./project-structure.md) — hooks, pages, registries
- [Authentication](../authentication.md) — token types (`sk_prv_*`, `sk_wkp_*`)
- [Core API](../core-api.md) — `instance`, `token.exchange`
- [Tools](../tools.md) — `ToolDefinition`, response helpers, `effect.redirect`
