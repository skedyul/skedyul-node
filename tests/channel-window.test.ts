import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ChannelDefinitionSchema,
  MessageSendInputSchema,
  MessageTemplateCreateInputSchema,
} from '../src/schemas.js'
import { defineChannel } from '../src/config/define.js'

const whatsapp = defineChannel({
  handle: 'whatsapp',
  label: 'WhatsApp',
  fields: [{ handle: 'phone', label: 'Phone', identifier: true }],
  capabilities: {
    messaging: {
      label: 'WhatsApp',
      send: 'send_whatsapp',
      window: { hours: 24 },
      templates: { create: 'create_template', delete: 'delete_template' },
    },
  },
})

describe('messaging window and templates capability', () => {
  it('keeps window and templates when a channel is parsed', () => {
    const parsed = ChannelDefinitionSchema.parse(whatsapp)
    assert.deepEqual(parsed.capabilities.messaging?.window, { hours: 24 })
    assert.deepEqual(parsed.capabilities.messaging?.templates, {
      create: 'create_template',
      delete: 'delete_template',
    })
  })

  it('rejects a non-positive window', () => {
    const result = ChannelDefinitionSchema.safeParse({
      ...whatsapp,
      capabilities: { messaging: { label: 'WhatsApp', window: { hours: 0 } } },
    })
    assert.equal(result.success, false)
  })
})

describe('template send payload', () => {
  const base = {
    channel: { id: 'ch_1', handle: 'whatsapp', identifierValue: '+61400000000' },
    message: { id: 'msg_1', content: 'Hi Sam' },
  }

  it('accepts a message without a template', () => {
    assert.equal(MessageSendInputSchema.safeParse(base).success, true)
  })

  it('accepts a template with named parameters', () => {
    const parsed = MessageSendInputSchema.parse({
      ...base,
      message: {
        ...base.message,
        template: {
          id: 'tpl_1',
          name: 'skd_reminder',
          language: 'en',
          parameters: { first_name: 'Sam' },
        },
      },
    })
    assert.equal(parsed.message.template?.parameters?.first_name, 'Sam')
  })

  it('validates template create input', () => {
    const result = MessageTemplateCreateInputSchema.safeParse({
      channel: base.channel,
      name: 'skd_reminder',
      language: 'en',
      category: 'utility',
      body: 'Hi {{first_name}}',
      parameters: [{ name: 'first_name', example: 'Sam' }],
    })
    assert.equal(result.success, true)
  })
})
