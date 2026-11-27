import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { channelSetup, runWithConfig } from '../src/core/client.js'

afterEach(() => {
  mock.reset()
})

function captureCoreCalls(data: unknown) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ success: true, data, errors: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return calls
}

const config = { baseUrl: 'https://example.test', apiToken: 'sk_wkp_test' }

describe('channelSetup client', () => {
  it('sends setRequirement to the core API', async () => {
    const calls = captureCoreCalls({ section: 'compliance', item: 'business', state: 'in_review' })
    const result = await runWithConfig(config, () =>
      channelSetup.setRequirement({ section: 'compliance', item: 'business', state: 'in_review' }),
    )
    assert.equal(calls[0].method, 'channelSetup.setRequirement')
    assert.deepEqual(calls[0].params, { section: 'compliance', item: 'business', state: 'in_review' })
    assert.equal(result.state, 'in_review')
  })

  it('passes appInstallationId through for app tokens', async () => {
    const calls = captureCoreCalls({ resource: 'number', synced: 1, removed: 0 })
    await runWithConfig(config, () =>
      channelSetup.syncResources({
        appInstallationId: 'ins_1',
        resource: 'number',
        replace: true,
        items: [{ id: 'PN1', title: '+61 400 000 000', status: 'active' }],
      }),
    )
    assert.equal(calls[0].method, 'channelSetup.syncResources')
    assert.equal(calls[0].params.appInstallationId, 'ins_1')
    assert.equal(calls[0].params.replace, true)
  })

  it('names each method after its namespace', async () => {
    const calls = captureCoreCalls({})
    await runWithConfig(config, async () => {
      await channelSetup.setConnection({ connection: 'meta', state: 'connected' })
      await channelSetup.removeResource({ resource: 'number', id: 'PN1' })
      await channelSetup.setChannelStatus({ communicationChannelId: 'ch_1', status: 'active' })
    })
    assert.deepEqual(
      calls.map((c) => c.method),
      ['channelSetup.setConnection', 'channelSetup.removeResource', 'channelSetup.setChannelStatus'],
    )
  })
})
