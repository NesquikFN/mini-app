import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { submitEventRatingSchema } from './event-rating.schemas'

function validInput(overrides: Partial<{ rating: number; tags: string[] }> = {}) {
  return { rating: 5, ...overrides }
}

describe('submitEventRatingSchema', () => {
  it('accepts a rating from 1 to 5 with no tags', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      assert.equal(submitEventRatingSchema.safeParse(validInput({ rating })).success, true)
    }
  })

  it('rejects a rating below 1 or above 5', () => {
    assert.equal(submitEventRatingSchema.safeParse(validInput({ rating: 0 })).success, false)
    assert.equal(submitEventRatingSchema.safeParse(validInput({ rating: 6 })).success, false)
  })

  it('rejects a non-integer rating', () => {
    assert.equal(submitEventRatingSchema.safeParse(validInput({ rating: 3.5 })).success, false)
  })

  it('defaults tags to an empty array when omitted', () => {
    const parsed = submitEventRatingSchema.parse(validInput())
    assert.deepEqual(parsed.tags, [])
  })

  it('accepts a valid subset of the allowed tags', () => {
    const result = submitEventRatingSchema.safeParse(
      validInput({ tags: ['well_organized', 'want_more'] }),
    )
    assert.equal(result.success, true)
  })

  it('rejects an unknown tag', () => {
    const result = submitEventRatingSchema.safeParse(validInput({ tags: ['free_pizza'] }))
    assert.equal(result.success, false)
  })

  it('rejects duplicate tags in the same submission', () => {
    const result = submitEventRatingSchema.safeParse(
      validInput({ tags: ['well_organized', 'well_organized'] }),
    )
    assert.equal(result.success, false)
  })

  it('accepts all five tags at once', () => {
    const result = submitEventRatingSchema.safeParse(
      validInput({
        tags: [
          'well_organized',
          'good_atmosphere',
          'started_on_time',
          'friendly_participants',
          'want_more',
        ],
      }),
    )
    assert.equal(result.success, true)
  })
})
