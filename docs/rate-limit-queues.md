# Rate-limit queues (queuedFetch)

Configure distributed rate limiting for external API calls and SDK operations in `skedyul.config`:

```ts
export default defineConfig({
  name: 'My App',
  queues: {
    stripeApi: {
      scope: 'provision',
      maxConcurrent: 5,
      minTime: 100,
      maxRetries: 3,
    },
    perInstall: {
      scope: 'install',
      maxConcurrent: 2,
      maxRetries: 5,
    },
    syncCustomers: {
      scope: 'install_endpoint',
      endpoint: 'sync_customers',
      maxConcurrent: 1,
      reservoir: 60,
      reservoirRefreshInterval: 60_000,
    },
  },
})
```

Use in tools/hooks:

```ts
import { queuedFetch } from 'skedyul'

await queuedFetch('stripeApi', () => stripe.customers.list())
await queuedFetch('stripeApi', () => fetch(url, init))
await requeue() // inside catch — re-acquire slot and re-run
```

## Queue scopes

| Scope | Redis key | Context |
|-------|-----------|---------|
| `provision` | `rl:pv:{appVersionId}:{queueName}` | Shared across installs of a version |
| `install` | `rl:in:{appInstallId}:{queueName}` | Per installation |
| `provision_endpoint` | `rl:pep:{appVersionId}:{endpoint}:{queueName}` | Per tool/hook during provision |
| `install_endpoint` | `rl:iep:{appInstallId}:{endpoint}:{queueName}` | Per tool/hook per install |
| `global` | `rl:gl:{appVersionId}:{queueName}` | Shared across all installs of a version |

Optional `endpoint` overrides auto-detection from `invocation.toolHandle` or `invocation.serverHookHandle`.

## QueueConfig fields

| Field | Description |
|-------|-------------|
| `maxConcurrent` | Max in-flight operations (Redis rate-limit queues) |
| `minTime` | Minimum ms between operation starts |
| `reservoir` | Token bucket capacity |
| `reservoirRefreshAmount` | Tokens added each refresh |
| `reservoirRefreshInterval` | Refresh window (ms) |
| `maxRetries` | SDK-level retries via `requeue()` |
| `retryDelayMs` | Delay before retry |
| `timeout` | Acquire + execution timeout (ms) |
| `mutex` | When `true`, this queue is a **correctness mutex** owned by a Temporal coordinator around the whole tool call (not a Redis lock acquired inside the Lambda) |
| `mutexOnly` (on `queueTouchPoints`) | Touch point is mutex-only — excluded from Redis probe/lease; Temporal owns it |
| `suppressesQueues` | While this mutex is held (including platform-held via `SKEDYUL_HELD_MUTEX_QUEUE_KEYS`), nested `queuedFetch` for listed queues skips acquire |
| `shouldRetry` | `(error, attempt) => boolean` (config file only, not serialized) |

### Ownership

| Queue kind | Coordinator | App Lambda |
|------------|-------------|------------|
| `mutex: true` / `mutexOnly: true` | Temporal `queueMutexCoordinator` | Skips acquire when `SKEDYUL_HELD_MUTEX_QUEUE_KEYS` lists the key |
| Throughput / rate-limit queues | Redis via Temporal worker activities | Skips acquire when `SKEDYUL_RATE_LIMIT_LEASES` lists the key |

Platform holds mutexes and Redis leases for the **entire tool invocation**. Optional `queuedFetch` around a critical section remains valid for docs/clarity and is a no-op skip when the platform already holds the key.

Redis rate-limit slots are acquired by workers (`SKEDYUL_REDIS_URL`); your code runs the Promise locally after the platform has admitted the call.
