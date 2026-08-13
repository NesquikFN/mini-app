import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import * as db from '../config/db'
import { eventsRepository } from '../repositories/events.repository'
import { eventRatingsRepository, type EventRatingRow } from '../repositories/event-ratings.repository'
import { usersRepository } from '../repositories/users.repository'
import { kyivNow, addDaysToISODate } from '../utils/kyivTime'
import type { Event } from '../types/event'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * Коротка оцінка завершеної події й репутація організатора. Той самий
 * підхід, що й в eventWaitlist.test.ts: справжній Express-застосунок і
 * справжній ланцюг middleware, підмінюється лише шар доступу до даних і
 * мережа Telegram.
 */

const EVENT_ID = '00000000-0000-0000-0000-0000000000ee'
const ORGANIZER_ID = '00000000-0000-0000-0000-000000000aa1'
const RATING_ID = '00000000-0000-0000-0000-0000000000c1'

const FUTURE_DATE = addDaysToISODate(kyivNow().date, 30)
// Завершилась учора — точно в минулому й точно в межах 7-денного вікна.
const RECENTLY_FINISHED_DATE = addDaysToISODate(kyivNow().date, -1)
// Завершилась 8 днів тому — минуле, але вікно оцінювання (7 днів) уже закрите.
const WINDOW_CLOSED_DATE = addDaysToISODate(kyivNow().date, -8)

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    creatorId: ORGANIZER_ID,
    title: 'Настолки',
    description: '',
    isOnline: true,
    vipOnly: false,
    gpuOnly: false,
    date: RECENTLY_FINISHED_DATE,
    time: '18:00:00',
    location: 'Онлайн',
    maxParticipants: 10,
    participantIds: [ORGANIZER_ID],
    createdAt: new Date().toISOString(),
    dormitoryId: '00000000-0000-0000-0000-000000000101',
    ...overrides,
  }
}

function stubEventReads(event: Event) {
  mock.method(eventsRepository, 'findById', async () => event)
  mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
  mock.method(eventsRepository, 'findWaitlistCounts', async () => new Map())
  mock.method(eventsRepository, 'findWaitlistPositions', async () => new Map())
}

function fakeRatingRow(overrides: Partial<EventRatingRow> = {}): EventRatingRow {
  return {
    id: RATING_ID,
    event_id: EVENT_ID,
    user_id: '00000000-0000-0000-0000-000000000bb1',
    organizer_id: ORGANIZER_ID,
    rating: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    moderated_at: null,
    removed_by: null,
    ...overrides,
  }
}

describe('GET /api/events/:id/rating', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('reports canRate=true for a participant of an already-finished event', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () => null)

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.canRate, true)
    assert.equal(res.body.myRating, null)
  })

  it('a non-participant sees canRate=false and no rating block to show', async () => {
    const outsider = buildUser()
    stubAuthLayer({ users: [outsider] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID] }))
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () => null)

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.canRate, false)
    assert.equal(res.body.myRating, null)
  })

  it('never exposes another participant\'s identity in this response', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () => fakeRatingRow({ user_id: participant.id }))
    mock.method(eventRatingsRepository, 'getTags', async () => [])

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(Object.keys(res.body).sort(), ['canRate', 'myRating'])
    assert.deepEqual(Object.keys(res.body.myRating).sort(), ['createdAt', 'rating', 'tags', 'updatedAt'])
  })

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get(`/api/events/${EVENT_ID}/rating`)
    assert.equal(res.status, 401)
  })
})

describe('PUT /api/events/:id/rating — who can rate', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('lets a real participant rate a finished event', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () =>
      fakeRatingRow({ user_id: participant.id, rating: 5 }))
    mock.method(eventRatingsRepository, 'getTags', async () => ['well_organized'])

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 5, tags: ['well_organized'] })

    assert.equal(res.status, 200)
    assert.equal(res.body.myRating.rating, 5)
    assert.equal(upsert.mock.callCount(), 1)
    // userId/organizerId must come from the session/event, never the body.
    assert.deepEqual(upsert.mock.calls[0].arguments.slice(0, 3), [EVENT_ID, participant.id, ORGANIZER_ID])
  })

  it('does not trust a client-supplied userId or organizerId', async () => {
    const participant = buildUser()
    const stranger = buildUser()
    stubAuthLayer({ users: [participant, stranger] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () => fakeRatingRow())
    mock.method(eventRatingsRepository, 'getTags', async () => [])

    await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 4, userId: stranger.id, organizerId: stranger.id })

    assert.equal(upsert.mock.calls[0].arguments[1], participant.id)
    assert.equal(upsert.mock.calls[0].arguments[2], ORGANIZER_ID)
  })

  it('refuses a non-participant with 403', async () => {
    const outsider = buildUser()
    stubAuthLayer({ users: [outsider] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID] }))
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`)
      .send({ rating: 5 })

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'NOT_A_PARTICIPANT')
    assert.equal(upsert.mock.callCount(), 0)
  })

  it('refuses the organizer rating their own event', async () => {
    const organizer = buildUser({ id: ORGANIZER_ID })
    stubAuthLayer({ users: [organizer] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID] }))
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(organizer)}`)
      .send({ rating: 5 })

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'ORGANIZER_CANNOT_RATE')
    assert.equal(upsert.mock.callCount(), 0)
  })

  it('refuses to rate an event that has not finished yet', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ date: FUTURE_DATE, participantIds: [ORGANIZER_ID, participant.id] }))
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 5 })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FINISHED')
    assert.equal(upsert.mock.callCount(), 0)
  })

  it('closes the rating window 7 days after the event finished', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ date: WINDOW_CLOSED_DATE, participantIds: [ORGANIZER_ID, participant.id] }))
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 5 })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'RATING_WINDOW_CLOSED')
    assert.equal(upsert.mock.callCount(), 0)
  })

  it('an unapproved user cannot reach the rating endpoint', async () => {
    const pending = buildUser({ registrationStatus: 'pending' })
    stubAuthLayer({ users: [pending] })
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(pending)}`)
      .send({ rating: 5 })

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'REGISTRATION_REQUIRED')
    assert.equal(upsert.mock.callCount(), 0)
  })

  it('a banned user cannot reach the rating endpoint', async () => {
    const banned = buildUser({ bannedPermanently: true })
    stubAuthLayer({ users: [banned] })
    const upsert = mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(banned)}`)
      .send({ rating: 5 })

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'USER_BANNED')
    assert.equal(upsert.mock.callCount(), 0)
  })
})

describe('PUT /api/events/:id/rating — atomic upsert and 24h edit window', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('sends an atomic ON CONFLICT upsert that also enforces the 24h edit window in SQL', async () => {
    // eventRatingsRepository.upsert runs inside withTransaction (a
    // dedicated client, not the shared pool.query), so the SQL text is
    // captured off pool.connect()'s client, not db.pool.query directly.
    const calls: unknown[][] = []
    const fakeClient = {
      query: async (text: string, params?: unknown[]) => {
        calls.push([text, params])
        if (/^insert into event_ratings/.test(text.trim())) {
          return { rows: [{ id: RATING_ID }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      },
      release: () => undefined,
    }
    mock.method(db.pool, 'connect', async () => fakeClient)

    await eventRatingsRepository.upsert(EVENT_ID, 'user-1', ORGANIZER_ID, 5, [])

    const insertCall = calls.find((call) => /^insert into event_ratings/.test(String(call[0]).trim()))
    assert.ok(insertCall, 'the upsert INSERT must have run')
    const sql = String(insertCall![0]).replace(/\s+/g, ' ')
    assert.match(sql, /on conflict \(event_id, user_id\) do update/)
    assert.match(sql, /created_at >= now\(\) - interval '24 hours'/)
    assert.match(sql, /moderated_at is null/)
  })

  it('lets a user change their vote within 24 hours of the first one', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    mock.method(eventRatingsRepository, 'upsert', async () => RATING_ID)
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () =>
      fakeRatingRow({ user_id: participant.id, rating: 2, created_at: new Date().toISOString() }))
    mock.method(eventRatingsRepository, 'getTags', async () => [])

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 2 })

    assert.equal(res.status, 200)
    assert.equal(res.body.canRate, true)
  })

  it('forbids changing the vote once 24 hours have passed', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    // The SQL upsert itself refuses the UPDATE branch outside the 24h
    // window (its WHERE clause fails) — repository returns null exactly
    // like a real conditional ON CONFLICT DO UPDATE would.
    mock.method(eventRatingsRepository, 'upsert', async () => null)
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () =>
      fakeRatingRow({
        user_id: participant.id,
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }))

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 1 })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'RATING_EDIT_WINDOW_CLOSED')
  })

  it('refuses to change a rating the moderator already excluded', async () => {
    const participant = buildUser()
    stubAuthLayer({ users: [participant] })
    stubEventReads(fakeEvent({ participantIds: [ORGANIZER_ID, participant.id] }))
    mock.method(eventRatingsRepository, 'upsert', async () => null)
    mock.method(eventRatingsRepository, 'findByEventAndUser', async () =>
      fakeRatingRow({ user_id: participant.id, moderated_at: new Date().toISOString() }))

    const res = await request(app)
      .put(`/api/events/${EVENT_ID}/rating`)
      .set('Authorization', `Bearer ${tokenFor(participant)}`)
      .send({ rating: 1 })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'RATING_MODERATED')
  })
})

describe('organizer reputation predicates', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  function stubQuery(rows: unknown[] = []) {
    return mock.method(db.pool, 'query', async () => ({
      rows,
      rowCount: rows.length,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }))
  }

  function sqlOf(call: { arguments: unknown[] }): string {
    return String(call.arguments[0]).replace(/\s+/g, ' ')
  }

  it('excludes moderated ratings from the ratings/average aggregation', async () => {
    const query = stubQuery([])
    await eventRatingsRepository.getOrganizerRatingStats([ORGANIZER_ID])
    assert.match(sqlOf(query.mock.calls[0]), /moderated_at is null/)
  })

  it('excludes moderated ratings from the 1..5 distribution', async () => {
    const query = stubQuery([])
    await eventRatingsRepository.getRatingDistribution(ORGANIZER_ID)
    assert.match(sqlOf(query.mock.calls[0]), /moderated_at is null/)
  })

  it('only counts events that have actually finished as "completed"', async () => {
    const query = stubQuery([])
    await eventRatingsRepository.getOrganizerParticipationStats([ORGANIZER_ID], '2026-01-01T00:00:00')
    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /\(e\.date \+ e\.time\) <= \$2::timestamp/)
  })
})

describe('admin rating moderation', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('refuses a non-admin', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const moderate = mock.method(eventRatingsRepository, 'moderate', async () => true)

    const res = await request(app)
      .delete(`/api/admin/event-ratings/${RATING_ID}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')
    assert.equal(moderate.mock.callCount(), 0)
  })

  it('lets an admin exclude a suspicious rating and restore it later', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const moderate = mock.method(eventRatingsRepository, 'moderate', async () => true)
    const restore = mock.method(eventRatingsRepository, 'restore', async () => true)

    const removeRes = await request(app)
      .delete(`/api/admin/event-ratings/${RATING_ID}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    assert.equal(removeRes.status, 200)
    assert.equal(moderate.mock.callCount(), 1)
    assert.deepEqual(moderate.mock.calls[0].arguments, [RATING_ID, admin.id])

    const restoreRes = await request(app)
      .post(`/api/admin/event-ratings/${RATING_ID}/restore`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    assert.equal(restoreRes.status, 200)
    assert.equal(restore.mock.callCount(), 1)
  })

  it('404s when moderating a rating that does not exist', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    mock.method(eventRatingsRepository, 'moderate', async () => false)

    const res = await request(app)
      .delete(`/api/admin/event-ratings/${RATING_ID}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'RATING_NOT_FOUND')
  })

  it('admin event detail includes ratings without anonymizing the rater', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubEventReads(fakeEvent())
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])
    mock.method(eventRatingsRepository, 'listForEvent', async () => [
      { ...fakeRatingRow(), first_name: 'Іван', nickname: null, tags: ['well_organized'] },
    ])

    const res = await request(app)
      .get(`/api/admin/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.ratings.length, 1)
    assert.equal(res.body.ratings[0].userName, 'Іван')
    assert.equal(res.body.ratings[0].userId, fakeRatingRow().user_id)
  })
})
