import { describe, expect, it } from 'vitest'
import { consumePendingPollId, setPendingPollId } from './pollDeepLink'

describe('pollDeepLink', () => {
  it('returns the id once and then clears it', () => {
    setPendingPollId('poll-123')
    expect(consumePendingPollId()).toBe('poll-123')
    expect(consumePendingPollId()).toBeUndefined()
  })

  it('overwrites a previously pending id with the latest one', () => {
    setPendingPollId('poll-a')
    setPendingPollId('poll-b')
    expect(consumePendingPollId()).toBe('poll-b')
    expect(consumePendingPollId()).toBeUndefined()
  })
})
