import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculatePercentages } from './polls.service'

describe('calculatePercentages', () => {
  it('returns 0 for every option when nobody voted yet', () => {
    assert.deepEqual(calculatePercentages([0, 0, 0]), [0, 0, 0])
  })

  it('splits an even vote evenly', () => {
    assert.deepEqual(calculatePercentages([5, 5]), [50, 50])
  })

  it('rounds each option independently', () => {
    // 1/3 of 3 total votes each → 33% (rounded), never NaN or negative.
    assert.deepEqual(calculatePercentages([1, 1, 1]), [33, 33, 33])
  })

  it('gives 100% to the only voted option', () => {
    assert.deepEqual(calculatePercentages([0, 4, 0]), [0, 100, 0])
  })

  it('handles a single option poll', () => {
    assert.deepEqual(calculatePercentages([7]), [100])
  })
})
