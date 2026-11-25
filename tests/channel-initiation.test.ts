import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ChannelDefinitionSchema } from '../src/schemas.js'
import { defineChannel } from '../src/config/define.js'

const instagram = defineChannel({
  handle: 'instagram',
  label: 'Instagram',
  fields: [{ handle: 'igsid', label: 'Instagram ID', identifier: true }],
  capabilities: {
    messaging: {
      label: 'Instagram',
      receive: 'receive_instagram',
      send: 'send_instagram',
      initiation: 'contact',
    },
  },
})

describe('messaging initiation capability', () => {
  it('keeps initiation when a channel is parsed', () => {
    const parsed = ChannelDefinitionSchema.parse(instagram)
    assert.equal(parsed.capabilities.messaging?.initiation, 'contact')
  })

  it('leaves initiation unset by default', () => {
    const parsed = ChannelDefinitionSchema.parse({
      ...instagram,
      capabilities: { messaging: { label: 'SMS', send: 'send_sms' } },
    })
    assert.equal(parsed.capabilities.messaging?.initiation, undefined)
  })

  it('rejects an unknown initiation value', () => {
    const result = ChannelDefinitionSchema.safeParse({
      ...instagram,
      capabilities: {
        messaging: { label: 'Instagram', send: 'send_instagram', initiation: 'anyone' },
      },
    })
    assert.equal(result.success, false)
  })
})
