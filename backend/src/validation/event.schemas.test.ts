import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createEventFromTemplateSchema,
  eventTemplateSchema,
} from './event.schemas'

const templateInput = {
  title: 'Мафія',
  description: '',
  weekday: 5,
  location: 'Онлайн',
  isOnline: true,
  maxParticipants: 12,
  gameUrlRequired: true,
}

describe('event template launch schema', () => {
  it('creates a template without a stored time', () => {
    const parsed = eventTemplateSchema.parse(templateInput)
    assert.equal('time' in parsed, false)
    assert.equal(parsed.gameUrlRequired, true)
  })

  it('requires time when the template is launched', () => {
    assert.equal(createEventFromTemplateSchema.safeParse({ gameUrl: null }).success, false)
    assert.equal(
      createEventFromTemplateSchema.safeParse({ time: '19:30', gameUrl: null }).success,
      true,
    )
  })

  it('accepts a valid game URL and rejects non-web protocols', () => {
    assert.equal(
      createEventFromTemplateSchema.safeParse({
        time: '19:30',
        gameUrl: 'https://example.com/join',
      }).success,
      true,
    )
    assert.equal(
      createEventFromTemplateSchema.safeParse({ time: '19:30', gameUrl: 'javascript:alert(1)' }).success,
      false,
    )
  })
})
