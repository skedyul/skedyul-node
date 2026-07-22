import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSequencerKey } from '../src/sequencer/resolve-sequencer-key.js'
import type { SerializableSequencerConfig } from '../src/config/sequencer-config.js'
import type { RateLimitExecutionContext } from '../src/ratelimit/types.js'
import {
  resetSequencerBackendForTests,
  memorySequencerBackend,
  resetMemorySequencerBackendForTests,
} from '../src/sequencer/backends/index.js'
import {
  runWithRateLimitExecutionContext,
} from '../src/ratelimit/context.js'
import {
  registerSequencerConfig,
  clearRegisteredSequencerConfig,
} from '../src/sequencer/config-loader.js'
import { allow, acquire, release } from '../src/sequencer/index.js'

const baseCtx: RateLimitExecutionContext = {
  app: { id: 'app_1', versionId: 'av_1' },
  appInstallationId: 'ai_1',
  invocation: { invocationId: 'inv_1', invocationType: 'tool_call', toolHandle: 'sync_customers' },
}

function cfg(
  scope: SerializableSequencerConfig['scope'],
  extra: Partial<SerializableSequencerConfig> = {},
): SerializableSequencerConfig {
  return { scope, enabled: true, ...extra }
}

describe('resolveSequencerKey', () => {
  it('resolves install scope with subKey', () => {
    const key = resolveSequencerKey('glofoxMember', cfg('install'), baseCtx, 'member_1')
    assert.equal(key, 'seq:in:ai_1:glofoxMember:member_1')
  })

  it('resolves provision scope', () => {
    const key = resolveSequencerKey('shared', cfg('provision'), baseCtx)
    assert.equal(key, 'seq:pv:av_1:shared')
  })
})

describe('memorySequencerBackend', () => {
  it('drops stale timestamps via allow', async () => {
    resetSequencerBackendForTests()
    resetMemorySequencerBackendForTests()
    const sequencerKey = `seq:test:${Date.now()}`

    const first = await memorySequencerBackend.allow(sequencerKey, {
      timestamp: 100,
    })
    assert.equal(first.allowed, true)
    assert.equal(first.reason, 'ok')

    const second = await memorySequencerBackend.allow(sequencerKey, {
      timestamp: 102,
    })
    assert.equal(second.allowed, true)

    const stale = await memorySequencerBackend.allow(sequencerKey, {
      timestamp: 101,
    })
    assert.equal(stale.allowed, false)
    assert.equal(stale.reason, 'stale')
  })

  it('blocks allow while another lease holds lock', async () => {
    resetSequencerBackendForTests()
    resetMemorySequencerBackendForTests()
    const sequencerKey = `seq:test:${Date.now()}`

    await memorySequencerBackend.acquire(sequencerKey, {
      leaseId: 'lease_a',
      timestamp: 200,
    })

    const blocked = await memorySequencerBackend.allow(sequencerKey, {
      timestamp: 201,
      leaseId: 'lease_b',
    })
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.reason, 'locked')
  })
})

describe('sequencer SDK', () => {
  it('returns disabled when sequencer not enabled in config', async () => {
    resetSequencerBackendForTests()
    clearRegisteredSequencerConfig()
    registerSequencerConfig({
      name: 'Test',
      sequencers: {
        offSequencer: { scope: 'install', enabled: false },
      },
    })

    process.env.SKEDYUL_SEQUENCER_MEMORY = 'true'

    const result = await runWithRateLimitExecutionContext(baseCtx, () =>
      allow('offSequencer', { timestamp: Date.now() }),
    )

    assert.equal(result.allowed, true)
    assert.equal(result.reason, 'disabled')
    delete process.env.SKEDYUL_SEQUENCER_MEMORY
  })

  it('allow/acquire/release through memory backend', async () => {
    resetSequencerBackendForTests()
    clearRegisteredSequencerConfig()
    registerSequencerConfig({
      name: 'Test',
      sequencers: {
        memberSeq: { scope: 'install', enabled: true },
      },
    })

    process.env.SKEDYUL_SEQUENCER_MEMORY = 'true'

    await runWithRateLimitExecutionContext(baseCtx, async () => {
      const allowed = await allow('memberSeq', {
        key: 'member_1',
        timestamp: 100,
        leaseId: 'trace_1',
      })
      assert.equal(allowed.allowed, true)

      await acquire('memberSeq', {
        key: 'member_1',
        leaseId: 'trace_1',
        timestamp: 100,
      })

      await release('memberSeq', {
        key: 'member_1',
        leaseId: 'trace_1',
      })
    })

    delete process.env.SKEDYUL_SEQUENCER_MEMORY
  })
})
