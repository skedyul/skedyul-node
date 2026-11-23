import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ChannelDefinitionSchema } from '../src/schemas.js'
import { defineChannel } from '../src/config/define.js'

const slack = defineChannel({
  handle: 'slack',
  label: 'Slack',
  fields: [{ handle: 'slack_user_id', label: 'Slack User', identifier: true }],
  capabilities: {
    messaging: { label: 'Slack', receive: 'receive_slack', send: 'send_slack' },
    askSkedyul: {
      label: 'Slack',
      conversations: ['direct'],
      addressing: 'installation',
      matchMemberBy: ['email'],
      send: 'send_slack',
    },
  },
})

describe('askSkedyul channel capability', () => {
  it('keeps askSkedyul when a channel is parsed', () => {
    const parsed = ChannelDefinitionSchema.parse(slack)
    assert.deepEqual(parsed.capabilities.askSkedyul, {
      label: 'Slack',
      conversations: ['direct'],
      addressing: 'installation',
      matchMemberBy: ['email'],
      send: 'send_slack',
    })
  })

  it('allows a shared channel with no messaging capability', () => {
    const parsed = ChannelDefinitionSchema.parse({
      handle: 'whatsapp_ask_skedyul',
      label: 'WhatsApp',
      fields: [{ handle: 'phone', label: 'Phone', identifier: true }],
      capabilities: {
        askSkedyul: {
          label: 'WhatsApp',
          conversations: ['direct', 'group'],
          addressing: 'shared',
          matchMemberBy: ['phone'],
          send: 'send_whatsapp',
        },
      },
    })
    assert.equal(parsed.capabilities.messaging, undefined)
    assert.equal(parsed.capabilities.askSkedyul?.addressing, 'shared')
  })

  it('keeps groupReplies and rejects unknown values', () => {
    const askSkedyul = {
      ...slack.capabilities.askSkedyul!,
      conversations: ['direct', 'group'],
      groupReplies: 'mentioned',
    }
    const parsed = ChannelDefinitionSchema.parse({ ...slack, capabilities: { askSkedyul } })
    assert.equal(parsed.capabilities.askSkedyul?.groupReplies, 'mentioned')

    const bad = ChannelDefinitionSchema.safeParse({
      ...slack,
      capabilities: { askSkedyul: { ...askSkedyul, groupReplies: 'sometimes' } },
    })
    assert.equal(bad.success, false)
  })

  it('rejects an unknown addressing or an empty conversations list', () => {
    const base = slack.capabilities.askSkedyul!
    for (const askSkedyul of [
      { ...base, addressing: 'global' },
      { ...base, conversations: [] },
      { ...base, matchMemberBy: [] },
    ]) {
      const result = ChannelDefinitionSchema.safeParse({
        ...slack,
        capabilities: { askSkedyul },
      })
      assert.equal(result.success, false)
    }
  })
})
