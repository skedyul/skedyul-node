# Sequencer (timestamp-aware ordering)

Configure optional sequencers in `skedyul.config` for stale-event dropping and short-lived locks:

```ts
export default defineConfig({
  name: 'My App',
  sequencers: {
    glofoxMember: {
      scope: 'install',
      enabled: true,
      lockTtlMs: 60_000,
      watermarkTtlMs: 7 * 24 * 60 * 60 * 1000,
    },
  },
})
```

Use in tools, hooks, or webhooks:

```ts
import { sequencer } from 'skedyul'

const result = await sequencer.allow('glofoxMember', {
  key: member.glofox_id,
  timestamp: eventTimestampMs,
  leaseId: event.traceId,
})

if (!result.allowed) {
  // reason: 'stale' | 'locked' | 'disabled'
  return
}

await sequencer.acquire('glofoxMember', {
  key: member.glofox_id,
  leaseId: traceId,
  timestamp: eventTimestampMs,
})
try {
  await pushToExternalApi(...)
} finally {
  await sequencer.release('glofoxMember', {
    key: member.glofox_id,
    leaseId: traceId,
  })
}
```

## Sequencer scopes

| Scope | Redis key | Context |
|-------|-----------|---------|
| `provision` | `seq:pv:{appVersionId}:{sequencerName}` | Shared across installs of a version |
| `install` | `seq:in:{appInstallId}:{sequencerName}` | Per installation |
| `provision_endpoint` | `seq:pep:{appVersionId}:{endpoint}:{sequencerName}` | Per tool/hook during provision |
| `install_endpoint` | `seq:iep:{appInstallId}:{endpoint}:{sequencerName}` | Per tool/hook per install |
| `global` | `seq:gl:{appVersionId}:{sequencerName}` | Shared across all installs of a version |

Optional `endpoint` overrides auto-detection from `invocation.toolHandle` or `invocation.serverHookHandle`.

Append `:subKey` for per-entity sequencing (e.g. per member ID).

## SequencerConfig fields

| Field | Description |
|-------|-------------|
| `scope` | Key namespace (same scopes as rate-limit queues) |
| `enabled` | Opt-in flag — missing or `false` disables the sequencer (allow always passes) |
| `lockTtlMs` | TTL for `acquire()` locks (default 60_000 ms) |
| `watermarkTtlMs` | Redis TTL for watermark keys (default 7 days) |
| `endpoint` | Override endpoint handle for `*_endpoint` scopes |

## Platform coordination

Sequencers use the same infrastructure path as [rate-limit queues](./rate-limit-queues.md):

- Same bearer auth (`sk_app_` / `sk_wkp_` tokens)
- Same execution context (`runWithRateLimitExecutionContext`)
- Same Redis cluster (`SKEDYUL_REDIS_URL`), separate key prefix (`seq:` vs `rl:`)
- Platform proxy routes: `/api/internal/sequencer/{allow,acquire,release}`

Set `SKEDYUL_SEQUENCER_MEMORY=true` for in-process fallback during local dev (mirrors `SKEDYUL_RATE_LIMIT_MEMORY`).

## Disabled behavior

If a sequencer name is missing from config or `enabled: false`:

- `allow()` → `{ allowed: true, reason: 'disabled' }`
- `acquire()` / `release()` → no-op

## Webhook burst example

```
allow('glofoxMember', { key, ts:100 }) → ok, watermark=100
allow('glofoxMember', { key, ts:102 }) → ok, watermark=102
allow('glofoxMember', { key, ts:101 }) → stale → skip downstream work
```
