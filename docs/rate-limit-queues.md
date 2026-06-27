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
| `maxConcurrent` | Max in-flight operations |
| `minTime` | Minimum ms between operation starts |
| `reservoir` | Token bucket capacity |
| `reservoirRefreshAmount` | Tokens added each refresh |
| `reservoirRefreshInterval` | Refresh window (ms) |
| `maxRetries` | SDK-level retries via `requeue()` |
| `retryDelayMs` | Delay before retry |
| `timeout` | Acquire + execution timeout (ms) |
| `shouldRetry` | `(error, attempt) => boolean` (config file only, not serialized) |

Platform proxy coordinates slots via Redis; your code runs the Promise locally after acquiring a slot.
