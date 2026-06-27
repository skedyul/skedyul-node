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
import { RequeueOutsideContextError } from '../src/ratelimit/errors.js'

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
})
