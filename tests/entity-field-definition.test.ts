import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CalendarWindowPullInputSchema,
  EntityDefinitionSchema,
  EntityFieldDefinitionSchema,
} from '../src/schemas'

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

test('EntityDefinitionSchema keeps tools.calendarWindowPull after parse', () => {
  const parsed = EntityDefinitionSchema.parse({
    handle: 'calendar_event',
    label: 'Calendar Event',
    fields: [{ handle: 'summary', label: 'Title' }],
    tools: { calendarWindowPull: 'pull_meetings_window' },
  })

  assert.equal(parsed.tools?.calendarWindowPull, 'pull_meetings_window')
})

test('CalendarWindowPullInputSchema accepts a structured window payload', () => {
  const parsed = CalendarWindowPullInputSchema.parse({
    window: {
      startAt: '2026-09-01T00:00:00.000Z',
      endAt: '2026-09-08T00:00:00.000Z',
      timezone: 'Pacific/Auckland',
    },
    model: { id: 'mdl_event', handle: 'event' },
    entity: { handle: 'calendar_event' },
  })

  assert.equal(parsed.window.startAt, '2026-09-01T00:00:00.000Z')
  assert.equal(parsed.entity?.handle, 'calendar_event')
})
