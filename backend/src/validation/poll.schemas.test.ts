import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPollSchema, pollBroadcastSchema, voteSchema } from './poll.schemas'

function validInput(overrides: Partial<{ question: string; options: string[]; endsAt: string | null }> = {}) {
  return {
    question: 'Що організувати наступним?',
    options: ['Мафія', 'Футбол', 'Кіновечір'],
    ...overrides,
  }
}

describe('createPollSchema', () => {
  it('accepts a valid poll with 2-8 distinct options', () => {
    assert.equal(createPollSchema.safeParse(validInput()).success, true)
    assert.equal(
      createPollSchema.safeParse(validInput({ options: ['А', 'Б'] })).success,
      true,
      'exactly 2 options is the minimum, must pass',
    )
    assert.equal(
      createPollSchema.safeParse(validInput({ options: Array.from({ length: 8 }, (_, i) => `Варіант ${i}`) }))
        .success,
      true,
      'exactly 8 options is the maximum, must pass',
    )
  })

  it('rejects fewer than 2 options', () => {
    const result = createPollSchema.safeParse(validInput({ options: ['Тільки один'] }))
    assert.equal(result.success, false)
  })

  it('rejects more than 8 options', () => {
    const result = createPollSchema.safeParse(
      validInput({ options: Array.from({ length: 9 }, (_, i) => `Варіант ${i}`) }),
    )
    assert.equal(result.success, false)
  })

  it('rejects duplicate options (case-insensitive, after trimming)', () => {
    assert.equal(
      createPollSchema.safeParse(validInput({ options: ['Мафія', 'мафія', 'Футбол'] })).success,
      false,
    )
    assert.equal(
      createPollSchema.safeParse(validInput({ options: ['Мафія', '  Мафія  ', 'Футбол'] })).success,
      false,
    )
  })

  it('rejects an empty or whitespace-only option', () => {
    assert.equal(createPollSchema.safeParse(validInput({ options: ['Мафія', '   '] })).success, false)
    assert.equal(createPollSchema.safeParse(validInput({ options: ['Мафія', ''] })).success, false)
  })

  it('rejects a question longer than 240 characters', () => {
    assert.equal(
      createPollSchema.safeParse(validInput({ question: 'а'.repeat(241) })).success,
      false,
    )
    assert.equal(
      createPollSchema.safeParse(validInput({ question: 'а'.repeat(240) })).success,
      true,
    )
  })

  it('rejects an empty question', () => {
    assert.equal(createPollSchema.safeParse(validInput({ question: '   ' })).success, false)
  })

  it('rejects an option longer than 120 characters', () => {
    assert.equal(
      createPollSchema.safeParse(validInput({ options: ['а'.repeat(121), 'Б'] })).success,
      false,
    )
    assert.equal(
      createPollSchema.safeParse(validInput({ options: ['а'.repeat(120), 'Б'] })).success,
      true,
    )
  })

  it('accepts a poll with no end date', () => {
    const parsed = createPollSchema.parse(validInput())
    assert.equal(parsed.endsAt, undefined)
  })

  it('rejects an end date in the past', () => {
    const result = createPollSchema.safeParse(
      validInput({ endsAt: new Date(Date.now() - 60_000).toISOString() }),
    )
    assert.equal(result.success, false)
  })

  it('accepts an end date in the future', () => {
    const result = createPollSchema.safeParse(
      validInput({ endsAt: new Date(Date.now() + 60 * 60_000).toISOString() }),
    )
    assert.equal(result.success, true)
  })
})

describe('voteSchema', () => {
  it('rejects a non-UUID optionId', () => {
    assert.equal(voteSchema.safeParse({ optionId: 'not-a-uuid' }).success, false)
  })

  it('accepts a UUID-shaped optionId', () => {
    assert.equal(
      voteSchema.safeParse({ optionId: '00000000-0000-0000-0000-000000000001' }).success,
      true,
    )
  })
})

describe('pollBroadcastSchema', () => {
  it('requires confirm to be exactly true', () => {
    assert.equal(pollBroadcastSchema.safeParse({ audience: 'all', confirm: false }).success, false)
    assert.equal(pollBroadcastSchema.safeParse({ audience: 'all' }).success, false)
    assert.equal(pollBroadcastSchema.safeParse({ audience: 'all', confirm: true }).success, true)
  })

  it('defaults resend to false', () => {
    const parsed = pollBroadcastSchema.parse({ audience: 'subscribers', confirm: true })
    assert.equal(parsed.resend, false)
  })

  it('rejects an audience outside all/subscribers', () => {
    assert.equal(
      pollBroadcastSchema.safeParse({ audience: 'everyone', confirm: true }).success,
      false,
    )
  })
})
