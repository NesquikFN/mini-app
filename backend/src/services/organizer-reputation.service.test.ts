import assert from 'node:assert/strict'
import { describe, it, afterEach, mock } from 'node:test'
import { eventRatingsRepository } from '../repositories/event-ratings.repository'
import { usersRepository } from '../repositories/users.repository'
import {
  computeIsReliableOrganizer,
  getOrganizerReputation,
} from './organizer-reputation.service'
import type { AuthUser } from '../types/user'

function baseStats(overrides: Partial<Parameters<typeof computeIsReliableOrganizer>[0]> = {}) {
  return {
    completedEvents: 3,
    ratingsCount: 10,
    avgRating: 4.3,
    organizerBanned: false,
    ...overrides,
  }
}

describe('computeIsReliableOrganizer', () => {
  it('qualifies an organizer who meets every threshold exactly', () => {
    assert.equal(computeIsReliableOrganizer(baseStats()), true)
  })

  it('requires at least 3 completed events', () => {
    assert.equal(computeIsReliableOrganizer(baseStats({ completedEvents: 2 })), false)
  })

  it('requires at least 10 ratings', () => {
    assert.equal(computeIsReliableOrganizer(baseStats({ ratingsCount: 9 })), false)
  })

  it('requires an average rating of at least 4.3', () => {
    assert.equal(computeIsReliableOrganizer(baseStats({ avgRating: 4.29 })), false)
    assert.equal(computeIsReliableOrganizer(baseStats({ avgRating: null })), false)
  })

  it('never qualifies a banned organizer, even with perfect stats', () => {
    assert.equal(
      computeIsReliableOrganizer(baseStats({ organizerBanned: true, avgRating: 5, ratingsCount: 100, completedEvents: 50 })),
      false,
    )
  })
})

describe('getOrganizerReputation', () => {
  const ORGANIZER_ID = '00000000-0000-0000-0000-000000000001'

  afterEach(() => {
    mock.restoreAll()
  })

  function fakeUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      id: ORGANIZER_ID,
      telegramId: 123,
      firstName: 'Організатор',
      registrationStatus: 'approved',
      bannedPermanently: false,
      notifyNewEvents: false,
      ...overrides,
    }
  }

  it('hides the average rating below 3 ratings', async () => {
    mock.method(usersRepository, 'getUserById', async () => fakeUser())
    mock.method(eventRatingsRepository, 'getOrganizerParticipationStats', async () =>
      new Map([[ORGANIZER_ID, { completedEvents: 5, totalParticipants: 20 }]]))
    mock.method(eventRatingsRepository, 'getOrganizerRatingStats', async () =>
      new Map([[ORGANIZER_ID, { ratingsCount: 2, avgRating: 5 }]]))
    mock.method(eventRatingsRepository, 'getTopTags', async () => [])

    const reputation = await getOrganizerReputation(ORGANIZER_ID)

    assert.equal(reputation.averageRating, undefined)
    assert.equal(reputation.ratingsCount, 2)
  })

  it('shows the average, rounded to one decimal, once there are 3+ ratings', async () => {
    mock.method(usersRepository, 'getUserById', async () => fakeUser())
    mock.method(eventRatingsRepository, 'getOrganizerParticipationStats', async () =>
      new Map([[ORGANIZER_ID, { completedEvents: 7, totalParticipants: 50 }]]))
    mock.method(eventRatingsRepository, 'getOrganizerRatingStats', async () =>
      new Map([[ORGANIZER_ID, { ratingsCount: 24, avgRating: 4.833333 }]]))
    mock.method(eventRatingsRepository, 'getTopTags', async () => ['well_organized'])

    const reputation = await getOrganizerReputation(ORGANIZER_ID)

    assert.equal(reputation.averageRating, 4.8)
    assert.equal(reputation.ratingsCount, 24)
    assert.equal(reputation.completedEventsCount, 7)
    assert.equal(reputation.totalParticipantsInCompletedEvents, 50)
    assert.deepEqual(reputation.topTags, ['well_organized'])
  })

  it('never qualifies the badge for a banned organizer even with strong stats', async () => {
    mock.method(usersRepository, 'getUserById', async () => fakeUser({ bannedPermanently: true }))
    mock.method(eventRatingsRepository, 'getOrganizerParticipationStats', async () =>
      new Map([[ORGANIZER_ID, { completedEvents: 10, totalParticipants: 100 }]]))
    mock.method(eventRatingsRepository, 'getOrganizerRatingStats', async () =>
      new Map([[ORGANIZER_ID, { ratingsCount: 50, avgRating: 5 }]]))
    mock.method(eventRatingsRepository, 'getTopTags', async () => [])

    const reputation = await getOrganizerReputation(ORGANIZER_ID)

    assert.equal(reputation.isReliableOrganizer, false)
  })
})
