import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SkillYAMLSchema } from '../src/skills/types'

test('SkillYAMLSchema keeps memory, tool needs, and reply.needs', () => {
  const parsed = SkillYAMLSchema.parse({
    handle: 'booking',
    name: 'Booking',
    instructions: 'Book a visit.',
    memory: [
      {
        id: 'client',
        entity: 'client',
        match: 'phone',
        tool: 'app:acme:clients_search',
        ttl: '2h',
      },
      {
        id: 'slot',
        tool: 'app:acme:slots_list',
        ttl: '10m',
      },
    ],
    tools: [
      { tool: 'app:acme:clients_search' },
      { tool: 'app:acme:slots_list', needs: ['client'] },
    ],
    reply: { needs: ['client'] },
  })

  assert.equal(parsed.memory?.[0]?.entity, 'client')
  assert.equal(parsed.memory?.[0]?.match, 'phone')
  assert.equal(parsed.memory?.[1]?.tool, 'app:acme:slots_list')
  assert.deepEqual(
    parsed.tools && Array.isArray(parsed.tools) ? parsed.tools[1]?.needs : undefined,
    ['client'],
  )
  assert.deepEqual(parsed.reply?.needs, ['client'])
})

test('SkillYAMLSchema rejects a memory ttl that is not a duration', () => {
  const result = SkillYAMLSchema.safeParse({
    handle: 'booking',
    name: 'Booking',
    instructions: 'Book a visit.',
    memory: [{ id: 'client', tool: 'app:acme:clients_search', ttl: '2 hours' }],
  })
  assert.equal(result.success, false)
})
