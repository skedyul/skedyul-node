import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveQueueKey } from '../src/ratelimit/resolve-queue-key.js'
import type { SerializableQueueConfig } from '../src/config/queue-config.js'
import type { RateLimitExecutionContext } from '../src/ratelimit/types.js'
import {
  resetRateLimitBackendForTests,
  memoryRateLimitBackend,
} from '../src/ratelimit/backends/index.js'
import {
  runWithRateLimitExecutionContext,
} from '../src/ratelimit/context.js'
import { registerQueueConfig, clearRegisteredQueueConfig } from '../src/ratelimit/config-loader.js'
import { queuedFetch, requeue } from '../src/ratelimit/queued-fetch.js'
import { RequeueOutsideContextError, RateLimitExceededError, QueuedFetchExhaustedError } from '../src/ratelimit/errors.js'
import { parsePreAcquiredLeases } from '../src/server/tool-handler.js'

const baseCtx: RateLimitExecutionContext = {
  app: { id: 'app_1', versionId: 'av_1' },
  appInstallationId: 'ai_1',
  invocation: { invocationId: 'inv_1', invocationType: 'tool_call', toolHandle: 'sync_customers' },
}

function cfg(
  scope: SerializableQueueConfig['scope'],
  extra: Partial<SerializableQueueConfig> = {},
): SerializableQueueConfig {
  return { scope, ...extra }
}

describe('resolveQueueKey', () => {
  it('resolves provision scope', () => {
    const key = resolveQueueKey('stripeApi', cfg('provision'), baseCtx)
    assert.equal(key, 'rl:pv:av_1:stripeApi')
  })

  it('resolves install scope', () => {
    const key = resolveQueueKey('perInstall', cfg('install'), baseCtx)
    assert.equal(key, 'rl:in:ai_1:perInstall')
  })

  it('resolves install_endpoint with toolHandle', () => {
    const key = resolveQueueKey('api', cfg('install_endpoint'), baseCtx)
    assert.equal(key, 'rl:iep:ai_1:sync_customers:api')
  })

  it('resolves provision_endpoint with explicit endpoint', () => {
    const key = resolveQueueKey(
      'hook',
      cfg('provision_endpoint', { endpoint: 'on_provision' }),
      { ...baseCtx, appInstallationId: undefined, isProvisionContext: true },
    )
    assert.equal(key, 'rl:pep:av_1:on_provision:hook')
  })

  it('resolves global scope with appVersionId', () => {
    const key = resolveQueueKey('shared', cfg('global'), baseCtx)
    assert.equal(key, 'rl:gl:av_1:shared')
  })

  it('appends sub key suffix', () => {
    const key = resolveQueueKey('stripeApi', cfg('install'), baseCtx, 'cust_123')
    assert.equal(key, 'rl:in:ai_1:stripeApi:cust_123')
  })
})

describe('memoryRateLimitBackend', () => {
  it('limits maxConcurrent', async () => {
    resetRateLimitBackendForTests()
    const queueKey = `rl:test:${Date.now()}`
    const limits = { maxConcurrent: 1 }

    const lease1 = await memoryRateLimitBackend.acquire(queueKey, limits, 5000)
    let secondStarted = false

    const second = memoryRateLimitBackend.acquire(queueKey, limits, 500).catch(() => {
      secondStarted = true
    })

    await new Promise((r) => setTimeout(r, 50))
    assert.equal(secondStarted, false)

    await memoryRateLimitBackend.release(lease1)
    await second
  })
})

describe('queuedFetch', () => {
  it('runs fn after acquiring slot', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'Test',
      queues: { testQueue: { scope: 'install', maxConcurrent: 2 } },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const result = await runWithRateLimitExecutionContext(baseCtx, () =>
      queuedFetch('testQueue', async () => 'ok'),
    )

    assert.equal(result, 'ok')
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('requeue throws outside queuedFetch context', async () => {
    await assert.rejects(() => requeue(), RequeueOutsideContextError)
  })

  it('skips acquire and release when preAcquiredLeases matches queueKey', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'Test',
      queues: { testQueue: { scope: 'install', maxConcurrent: 1 } },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const queueKey = resolveQueueKey('testQueue', cfg('install'), baseCtx)
    const acquireCalls: string[] = []
    const releaseCalls: string[] = []
    const originalAcquire = memoryRateLimitBackend.acquire.bind(memoryRateLimitBackend)
    const originalRelease = memoryRateLimitBackend.release.bind(memoryRateLimitBackend)

    memoryRateLimitBackend.acquire = async (...args) => {
      acquireCalls.push(args[0] as string)
      return originalAcquire(...args)
    }
    memoryRateLimitBackend.release = async (lease) => {
      releaseCalls.push(lease.queueKey)
      return originalRelease(lease)
    }

    const ctx: RateLimitExecutionContext = {
      ...baseCtx,
      preAcquiredLeases: [{ queueKey, leaseId: 'orchestration_lease_1' }],
    }

    const result = await runWithRateLimitExecutionContext(ctx, () =>
      queuedFetch('testQueue', async () => 'pre-leased'),
    )

    assert.equal(result, 'pre-leased')
    assert.deepEqual(acquireCalls, [])
    assert.deepEqual(releaseCalls, [])

    memoryRateLimitBackend.acquire = originalAcquire
    memoryRateLimitBackend.release = originalRelease
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('still acquires when preAcquiredLeases does not match queueKey', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'Test',
      queues: {
        queueA: { scope: 'install', maxConcurrent: 1 },
        queueB: { scope: 'install', maxConcurrent: 1 },
      },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const queueAKey = resolveQueueKey('queueA', cfg('install'), baseCtx)
    const acquireCalls: string[] = []
    const originalAcquire = memoryRateLimitBackend.acquire.bind(memoryRateLimitBackend)

    memoryRateLimitBackend.acquire = async (...args) => {
      acquireCalls.push(args[0] as string)
      return originalAcquire(...args)
    }

    const ctx: RateLimitExecutionContext = {
      ...baseCtx,
      preAcquiredLeases: [{ queueKey: queueAKey, leaseId: 'lease_a' }],
    }

    await runWithRateLimitExecutionContext(ctx, () =>
      queuedFetch('queueB', async () => 'other-queue'),
    )

    assert.equal(acquireCalls.length, 1)
    assert.match(acquireCalls[0]!, /queueB/)

    memoryRateLimitBackend.acquire = originalAcquire
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('allows multiple queuedFetch calls with one pre-lease without extra acquires', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'Test',
      queues: { testQueue: { scope: 'install', maxConcurrent: 1 } },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const queueKey = resolveQueueKey('testQueue', cfg('install'), baseCtx)
    const acquireCalls: string[] = []
    const originalAcquire = memoryRateLimitBackend.acquire.bind(memoryRateLimitBackend)

    memoryRateLimitBackend.acquire = async (...args) => {
      acquireCalls.push(args[0] as string)
      return originalAcquire(...args)
    }

    const ctx: RateLimitExecutionContext = {
      ...baseCtx,
      preAcquiredLeases: [{ queueKey, leaseId: 'orchestration_lease_1' }],
    }

    await runWithRateLimitExecutionContext(ctx, async () => {
      await queuedFetch('testQueue', async () => 'first')
      await queuedFetch('testQueue', async () => 'second')
    })

    assert.deepEqual(acquireCalls, [])

    memoryRateLimitBackend.acquire = originalAcquire
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('rethrows RateLimitExceededError when maxRetries is 0', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'Test',
      queues: { testQueue: { scope: 'install', maxConcurrent: 1, maxRetries: 0 } },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    await assert.rejects(
      () =>
        runWithRateLimitExecutionContext(baseCtx, () =>
          queuedFetch('testQueue', async () => {
            throw new RateLimitExceededError(1500, 'Rate limit exceeded')
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof RateLimitExceededError)
        return true
      },
    )

    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('uses only booking mutex acquire when inner work avoids nested api queuedFetch', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'ExampleApp',
      queues: {
        booking_mutex: {
          scope: 'install',
          maxConcurrent: 1,
          maxRetries: 0,
          mutex: true,
          suppressesQueues: ['api'],
        },
        api: {
          scope: 'install',
          maxConcurrent: 2,
          maxRetries: 0,
          reservoir: 12,
        },
      },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const acquireCalls: string[] = []
    const originalAcquire = memoryRateLimitBackend.acquire.bind(memoryRateLimitBackend)
    memoryRateLimitBackend.acquire = async (...args) => {
      acquireCalls.push(args[0] as string)
      return originalAcquire(...args)
    }

    await runWithRateLimitExecutionContext(baseCtx, () =>
      queuedFetch({ queue: 'booking_mutex', key: 'cal-1' }, async () => {
        await Promise.resolve('http-1')
        await Promise.resolve('http-2')
        await Promise.resolve('http-3')
        return 'booked'
      }),
    )

    assert.equal(acquireCalls.length, 1)
    assert.match(acquireCalls[0]!, /booking_mutex:cal-1/)

    memoryRateLimitBackend.acquire = originalAcquire
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('skips nested api acquires inside an active mutex queue', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'ExampleApp',
      queues: {
        booking_mutex: {
          scope: 'install',
          maxConcurrent: 1,
          maxRetries: 0,
          mutex: true,
          suppressesQueues: ['api'],
        },
        api: {
          scope: 'install',
          maxConcurrent: 2,
          maxRetries: 0,
          reservoir: 12,
        },
      },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const acquireCalls: string[] = []
    const originalAcquire = memoryRateLimitBackend.acquire.bind(memoryRateLimitBackend)
    memoryRateLimitBackend.acquire = async (...args) => {
      acquireCalls.push(args[0] as string)
      return originalAcquire(...args)
    }

    await runWithRateLimitExecutionContext(baseCtx, () =>
      queuedFetch({ queue: 'booking_mutex', key: 'cal-1' }, async () => {
        await queuedFetch('api', async () => 'http-1')
        await queuedFetch('api', async () => 'http-2')
        await queuedFetch('api', async () => 'http-3')
        return 'booked'
      }),
    )

    assert.equal(acquireCalls.length, 1)
    assert.match(acquireCalls[0]!, /booking_mutex:cal-1/)

    memoryRateLimitBackend.acquire = originalAcquire
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('waits for api slot with maxRetries before failing', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'ExampleApp',
      queues: {
        api: {
          scope: 'install',
          maxConcurrent: 1,
          maxRetries: 2,
          retryDelayMs: 10,
          timeout: 5000,
        },
      },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const queueKey = resolveQueueKey('api', cfg('install'), baseCtx)
    const held = await memoryRateLimitBackend.acquire(
      queueKey,
      { maxConcurrent: 1 },
      5000,
    )

    let completed = false
    const waiter = runWithRateLimitExecutionContext(baseCtx, () =>
      queuedFetch('api', async () => {
        completed = true
        return 'ok'
      }),
    )

    await new Promise((r) => setTimeout(r, 30))
    assert.equal(completed, false)

    await memoryRateLimitBackend.release(held)
    const result = await waiter

    assert.equal(result, 'ok')
    assert.equal(completed, true)

    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })

  it('still acquires api per call outside booking mutex', async () => {
    resetRateLimitBackendForTests()
    clearRegisteredQueueConfig()
    registerQueueConfig({
      name: 'ExampleApp',
      queues: {
        api: {
          scope: 'install',
          maxConcurrent: 2,
          maxRetries: 0,
          reservoir: 12,
        },
      },
    })

    process.env.SKEDYUL_RATE_LIMIT_MEMORY = 'true'

    const acquireCalls: string[] = []
    const originalAcquire = memoryRateLimitBackend.acquire.bind(memoryRateLimitBackend)
    memoryRateLimitBackend.acquire = async (...args) => {
      acquireCalls.push(args[0] as string)
      return originalAcquire(...args)
    }

    await runWithRateLimitExecutionContext(baseCtx, async () => {
      await queuedFetch('api', async () => 'call-1')
      await queuedFetch('api', async () => 'call-2')
    })

    assert.equal(acquireCalls.length, 2)
    assert.ok(acquireCalls.every((key) => key.includes(':api')))

    memoryRateLimitBackend.acquire = originalAcquire
    delete process.env.SKEDYUL_RATE_LIMIT_MEMORY
  })
})

describe('parsePreAcquiredLeases', () => {
  it('parses SKEDYUL_RATE_LIMIT_LEASES JSON env payload', () => {
    const leases = parsePreAcquiredLeases(
      JSON.stringify([
        { queueKey: 'rl:in:ai_1:api', leaseId: 'lease_1' },
      ]),
    )

    assert.deepEqual(leases, [
      { queueKey: 'rl:in:ai_1:api', leaseId: 'lease_1' },
    ])
  })

  it('returns undefined for invalid payloads', () => {
    assert.equal(parsePreAcquiredLeases(undefined), undefined)
    assert.equal(parsePreAcquiredLeases('not-json'), undefined)
    assert.equal(parsePreAcquiredLeases('{"queueKey":"x"}'), undefined)
  })
})
