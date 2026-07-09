import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toGsm7, estimateSmsSegments } from '../src/tools/sms/gsm7.js'

describe('toGsm7', () => {
  it('strips non-GSM characters', () => {
    assert.equal(toGsm7('Hello 👋'), 'Hello ')
  })
})

describe('estimateSmsSegments', () => {
  it('counts segments for gsm7-normalized text', () => {
    const rendered = `Hey ${toGsm7('Sam 😀')}, Hows it going ${toGsm7("O'Brien")}`
    const estimate = estimateSmsSegments(rendered)
    assert.equal(estimate.encoding, 'GSM-7')
    assert.equal(estimate.segments, 1)
  })
})
