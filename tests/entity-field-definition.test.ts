import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EntityDefinitionSchema, EntityFieldDefinitionSchema } from '../src/schemas'

test('EntityFieldDefinitionSchema keeps a global definition handle', () => {
  const parsed = EntityFieldDefinitionSchema.parse({
    handle: 'recurrence',
    label: 'Recurrence Rules',
    type: 'object',
    definition: 'calendar/recurrence',
  })

  assert.equal(parsed.definition, 'calendar/recurrence')
  assert.equal(parsed.type, 'object')
})

test('EntityDefinitionSchema keeps definition on entity fields after parse', () => {
  const parsed = EntityDefinitionSchema.parse({
    handle: 'calendar_event',
    label: 'Calendar Event',
    fields: [
      {
        handle: 'recurrence',
        label: 'Recurrence Rules',
        type: 'object',
        definition: 'calendar/recurrence',
      },
      {
        handle: 'recurring_event_id',
        label: 'Recurring Event ID',
        type: 'string',
        definition: 'calendar/series_id',
      },
    ],
  })

  assert.equal(parsed.fields[0]?.definition, 'calendar/recurrence')
  assert.equal(parsed.fields[1]?.definition, 'calendar/series_id')
})
