import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createEventSchema,
  createEventFromTemplateSchema,
  eventTemplateSchema,
  updateEventSchema,
} from './event.schemas'

const templateInput = {
  title: 'Мафія',
  description: '',
  location: 'Онлайн',
  isOnline: true,
  gameUrlRequired: true,
}

describe('event template launch schema', () => {
  it('creates a template without a stored date or time', () => {
    const parsed = eventTemplateSchema.parse(templateInput)
    assert.equal('time' in parsed, false)
    assert.equal('weekday' in parsed, false)
    assert.equal(parsed.gameUrlRequired, true)
  })

  it('requires a date and time when the template is launched', () => {
    assert.equal(createEventFromTemplateSchema.safeParse({ gameUrl: null }).success, false)
    assert.equal(
      createEventFromTemplateSchema.safeParse({ date: '2099-09-10', time: '19:30', maxParticipants: 12, gameUrl: null }).success,
      true,
    )
    assert.equal(
      createEventFromTemplateSchema.safeParse({ date: '2099-09-10', time: '19:30', gameUrl: null }).success,
      false,
    )
  })

  it('accepts a valid game URL and rejects non-web protocols', () => {
    assert.equal(
      createEventFromTemplateSchema.safeParse({
        date: '2099-09-10',
        time: '19:30',
        maxParticipants: 12,
        gameUrl: 'https://example.com/join',
      }).success,
      true,
    )
    assert.equal(
      createEventFromTemplateSchema.safeParse({ date: '2099-09-10', time: '19:30', maxParticipants: 12, gameUrl: 'javascript:alert(1)' }).success,
      false,
    )
  })
})

describe('VIP event schema', () => {
  const eventInput = {
    title: 'Закрита зустріч',
    description: '',
    date: '2099-09-10',
    time: '19:30',
    location: 'Хол',
    maxParticipants: 10,
  }

  it('keeps ordinary events non-VIP by default', () => {
    assert.equal(createEventSchema.parse(eventInput).vipOnly, false)
  })

  it('accepts an explicit VIP-only event flag', () => {
    assert.equal(createEventSchema.parse({ ...eventInput, vipOnly: true }).vipOnly, true)
  })
})

describe('GPU event schema', () => {
  const eventInput = {
    title: 'Закрита зустріч ГПУ',
    description: '',
    date: '2099-09-10',
    time: '19:30',
    location: 'Хол',
    maxParticipants: 10,
  }

  it('keeps ordinary events non-GPU by default', () => {
    assert.equal(createEventSchema.parse(eventInput).gpuOnly, false)
  })

  it('accepts an explicit GPU-only event flag', () => {
    assert.equal(createEventSchema.parse({ ...eventInput, gpuOnly: true }).gpuOnly, true)
  })

  it('rejects an event that is both VIP-only and GPU-only', () => {
    assert.equal(
      createEventSchema.safeParse({ ...eventInput, vipOnly: true, gpuOnly: true }).success,
      false,
    )
  })

  it('rejects a PATCH that turns an event both VIP-only and GPU-only', () => {
    assert.equal(
      updateEventSchema.safeParse({ vipOnly: true, gpuOnly: true }).success,
      false,
    )
  })

  it('allows a PATCH that sets only one of the two flags', () => {
    assert.equal(updateEventSchema.safeParse({ gpuOnly: true }).success, true)
    assert.equal(updateEventSchema.safeParse({ vipOnly: true }).success, true)
  })
})
