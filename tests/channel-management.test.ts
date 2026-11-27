import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ChannelDefinitionSchema, ProvisionConfigSchema } from '../src/schemas.js'
import { defineChannel } from '../src/config/define.js'

const phone = defineChannel({
  handle: 'phone',
  label: 'Phone',
  description: 'SMS and calls from your own numbers.',
  fields: [{ handle: 'phone', label: 'Phone', identifier: true }],
  capabilities: { messaging: { label: 'SMS', send: 'send_sms' } },
  management: {
    noun: { one: 'number', many: 'numbers' },
    order: 1,
    archiveNote: 'The number stays in your account until you release it.',
    features: [
      { key: 'sms', label: 'SMS', icon: 'MessageSquare' },
      { key: 'voice', label: 'Voice', icon: 'Phone', attribute: 'voiceEnabled' },
    ],
    setup: {
      sections: [
        {
          kind: 'requirements',
          handle: 'compliance',
          title: 'Regulatory compliance',
          scope: [{ label: 'Country', value: 'Australia' }],
          items: [
            {
              handle: 'business',
              title: 'Business details',
              fields: [{ key: 'abn', label: 'ABN', copy: true }],
              actions: {
                not_started: { handle: 'add', label: 'Add details', tool: 'submit_business' },
                rejected: { handle: 'fix', label: 'Fix details', tool: 'submit_business' },
              },
            },
          ],
        },
        { kind: 'domains', handle: 'domains', title: 'Domains', purpose: 'sending' },
      ],
    },
    tabs: [
      {
        handle: 'forwarding',
        label: 'Call forwarding',
        icon: 'PhoneForwarded',
        sections: [
          {
            kind: 'form',
            handle: 'forwarding',
            title: 'Forward calls',
            fields: [
              { kind: 'toggle', key: 'forward', label: 'Forward calls' },
              { kind: 'text', key: 'to', label: 'Forward to', placeholder: '+61…' },
              {
                kind: 'select',
                key: 'when',
                label: 'When',
                options: [
                  { value: 'always', label: 'Always' },
                  { value: 'busy', label: 'When busy' },
                ],
              },
            ],
            showWhen: { to: { field: 'forward', equals: true } },
            submit: { handle: 'save', label: 'Save', tool: 'save_forwarding' },
          },
        ],
      },
    ],
    add: {
      title: 'Add a number',
      requires: { sections: ['compliance'], message: 'Finish compliance first.' },
      steps: [
        {
          handle: 'pick',
          title: 'Pick a number',
          sections: [
            {
              kind: 'purchase',
              handle: 'search',
              title: 'Search numbers',
              filters: [
                {
                  kind: 'select',
                  key: 'country',
                  label: 'Country',
                  default: 'AU',
                  options: [{ value: 'AU', label: 'Australia' }],
                },
                { kind: 'multi', key: 'caps', label: 'Supports', options: [{ value: 'sms', label: 'SMS' }] },
              ],
              searchTool: 'search_numbers',
              select: { handle: 'buy', label: 'Buy', tool: 'buy_number' },
            },
          ],
          next: { handle: 'next', label: 'Continue', tool: 'confirm_number' },
        },
      ],
      done: { title: 'Number added', body: 'Messages to it now arrive in Threads.' },
    },
  },
})

describe('channel management', () => {
  it('keeps management and description when a channel is parsed', () => {
    const parsed = ChannelDefinitionSchema.parse(phone)
    assert.equal(parsed.description, 'SMS and calls from your own numbers.')
    assert.deepEqual(parsed.management, phone.management)
  })

  it('accepts a channel without management', () => {
    const { management: _omit, ...plain } = phone
    assert.equal(ChannelDefinitionSchema.safeParse(plain).success, true)
  })

  it('rejects an action with neither tool nor href', () => {
    const result = ChannelDefinitionSchema.safeParse({
      ...phone,
      management: {
        noun: { one: 'number', many: 'numbers' },
        setup: {
          sections: [
            {
              kind: 'connection',
              handle: 'account',
              title: 'Account',
              connection: 'account',
              connect: { handle: 'connect', label: 'Connect' },
            },
          ],
        },
      },
    })
    assert.equal(result.success, false)
  })

  it('rejects an unknown section kind', () => {
    const result = ChannelDefinitionSchema.safeParse({
      ...phone,
      management: {
        noun: { one: 'number', many: 'numbers' },
        setup: { sections: [{ kind: 'chart', handle: 'x', title: 'X' }] },
      },
    })
    assert.equal(result.success, false)
  })

  it('keeps an action form with file, email and required fields', () => {
    const management = {
      noun: { one: 'number', many: 'numbers' },
      setup: {
        sections: [
          {
            kind: 'requirements' as const,
            handle: 'compliance',
            title: 'Compliance',
            items: [
              {
                handle: 'business',
                title: 'Business registration',
                actions: {
                  not_started: {
                    handle: 'submit',
                    label: 'Submit documents',
                    tool: 'submit_compliance_document',
                    form: {
                      title: 'Business registration',
                      submitLabel: 'Submit',
                      fields: [
                        { kind: 'text' as const, key: 'business_name', label: 'Business name', required: true },
                        { kind: 'text' as const, key: 'business_email', label: 'Email', inputType: 'email' as const },
                        { kind: 'text' as const, key: 'address', label: 'Address', multiline: true },
                        { kind: 'file' as const, key: 'file', label: 'Register excerpt', accept: 'application/pdf', required: true },
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    }
    const parsed = ChannelDefinitionSchema.parse({ ...phone, management })
    assert.deepEqual(parsed.management, management)
  })

  it('rejects an action form without fields', () => {
    const result = ChannelDefinitionSchema.safeParse({
      ...phone,
      management: {
        noun: { one: 'number', many: 'numbers' },
        setup: {
          sections: [
            {
              kind: 'details',
              handle: 'd',
              title: 'D',
              items: [],
              action: { handle: 'a', label: 'A', tool: 't', form: { title: 'T', fields: [] } },
            },
          ],
        },
      },
    })
    assert.equal(result.success, false)
  })

  it('accepts domain purposes in provision', () => {
    const parsed = ProvisionConfigSchema.parse({
      channels: [phone],
      domains: [{ handle: 'sending', label: 'Sending email' }],
    })
    assert.deepEqual(parsed.domains, [{ handle: 'sending', label: 'Sending email' }])
  })
})
