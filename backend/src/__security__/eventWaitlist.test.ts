import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import * as db from '../config/db'
import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { notificationLogRepository } from '../repositories/notification-log.repository'
import * as eventsService from '../services/events.service'
import { NO_DORMITORY_ID } from '../types/dormitory'
import { kyivNow, addDaysToISODate } from '../utils/kyivTime'
import type { Event } from '../types/event'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * Лист очікування. Сама черга (FIFO, атомарність, просування) живе в
 * PostgreSQL-функціях і перевіряється проти справжньої бази в
 * __tests__/waitlist.integration.test.ts. Тут — HTTP-шар: права доступу,
 * коди помилок, форма відповіді й те, що жоден шлях, який звільняє
 * місце, не забуває просунути чергу.
 */

const DORM_A = '00000000-0000-0000-0000-000000000101'
const DORM_B = '00000000-0000-0000-0000-000000000102'
const EVENT_ID = '00000000-0000-0000-0000-0000000000ee'
const FUTURE_DATE = addDaysToISODate(kyivNow().date, 30)
const PAST_DATE = addDaysToISODate(kyivNow().date, -1)

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    creatorId: '00000000-0000-0000-0000-000000000001',
    title: 'Настолки',
    description: '',
    isOnline: true,
    vipOnly: false,
    gpuOnly: false,
    date: FUTURE_DATE,
    time: '18:00:00',
    location: 'Онлайн',
    maxParticipants: 2,
    participantIds: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2'],
    createdAt: new Date().toISOString(),
    dormitoryId: DORM_A,
    ...overrides,
  }
}

/**
 * Змушує наступний реальний запит до Postgres впасти з помилкою, яку
 * підняла б сама SQL-функція. Підміняється саме pool.query, тож код
 * репозиторію — включно з перекладом кодів помилок у AppError —
 * лишається справжнім, а не дублюється в тесті.
 */
function stubQueryRejecting(marker: string) {
  return mock.method(db.pool, 'query', async () => {
    throw new Error(`error: ${marker}`)
  })
}

/** Мінімальні заглушки читань, які роблять усі waitlist-шляхи. */
function stubEventReads(event: Event) {
  mock.method(eventsRepository, 'findById', async () => event)
  mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
  mock.method(eventsRepository, 'findWaitlistCounts', async () => new Map([[event.id, 1]]))
  mock.method(eventsRepository, 'findWaitlistPositions', async () => new Map())
}

describe('joining the waitlist', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('adds an outsider to the queue of a full event', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    const joinWaitlist = mock.method(eventsRepository, 'joinWaitlist', async () => 1)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(joinWaitlist.mock.callCount(), 1)
    assert.deepEqual(joinWaitlist.mock.calls[0].arguments, [EVENT_ID, user.id])
  })

  it('falls back to a normal join when a seat freed up in the meantime', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])
    // EVENT_NOT_FULL — подія вже не заповнена, черга не потрібна.
    // Помилку піднімає сама SQL-функція, тож переклад у EventNotFullError
    // виконує справжній код репозиторію.
    stubQueryRejecting('EVENT_NOT_FULL')
    const addParticipant = mock.method(eventsRepository, 'addParticipant', async () => {})

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(addParticipant.mock.callCount(), 1, 'must join outright instead of queueing')
  })

  it('refuses a second queue entry with 409 ALREADY_WAITLISTED', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    stubQueryRejecting('ALREADY_WAITLISTED')

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'ALREADY_WAITLISTED')
  })

  it('refuses a participant with 409 ALREADY_JOINED', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    stubQueryRejecting('ALREADY_JOINED')

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'ALREADY_JOINED')
  })

  it('refuses to queue for a finished event', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent({ date: PAST_DATE, time: '10:00:00' }))
    const joinWaitlist = mock.method(eventsRepository, 'joinWaitlist', async () => 1)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_ARCHIVED')
    assert.equal(joinWaitlist.mock.callCount(), 0)
  })

  it('hides a VIP event from a non-VIP user behind a 404', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent({ vipOnly: true }))
    const joinWaitlist = mock.method(eventsRepository, 'joinWaitlist', async () => 1)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
    assert.equal(joinWaitlist.mock.callCount(), 0)
  })

  it('hides a GPU event from a non-GPU user behind a 404', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user], vips: [user.id] })
    stubEventReads(fakeEvent({ gpuOnly: true }))
    const joinWaitlist = mock.method(eventsRepository, 'joinWaitlist', async () => 1)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal(joinWaitlist.mock.callCount(), 0)
  })

  it('lets a VIP queue for a VIP event', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user], vips: [user.id] })
    stubEventReads(fakeEvent({ vipOnly: true }))
    const joinWaitlist = mock.method(eventsRepository, 'joinWaitlist', async () => 1)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(joinWaitlist.mock.callCount(), 1)
  })

  it('refuses an offline event to a user without a dormitory', async () => {
    const user = buildUser({ dormitoryId: NO_DORMITORY_ID })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent({ isOnline: false, location: 'Хол' }))
    const joinWaitlist = mock.method(eventsRepository, 'joinWaitlist', async () => 1)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal(joinWaitlist.mock.callCount(), 0)
  })

  it('returns 404 for an event that does not exist', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    mock.method(eventsRepository, 'findById', async () => null)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
  })
})

describe('leaving the waitlist', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('removes the caller from the queue', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    const leaveWaitlist = mock.method(eventsRepository, 'leaveWaitlist', async () => true)

    const res = await request(app)
      .delete(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(leaveWaitlist.mock.calls[0].arguments, [EVENT_ID, user.id])
  })

  it('answers 409 when the caller was not queued', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    mock.method(eventsRepository, 'leaveWaitlist', async () => false)

    const res = await request(app)
      .delete(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'NOT_WAITLISTED')
  })
})

describe('every seat-freeing path promotes the queue', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('promotes after a participant leaves', async () => {
    const user = buildUser({ id: '00000000-0000-0000-0000-0000000000f2', dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubEventReads(fakeEvent())
    mock.method(eventsRepository, 'removeParticipant', async () => true)
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => [])

    const res = await request(app)
      .delete(`/api/events/${EVENT_ID}/leave`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(promote.mock.callCount(), 1, 'leaving must promote the queue')
  })

  it('promotes after the organizer removes a participant', async () => {
    const event = fakeEvent()
    const owner = buildUser({ id: event.creatorId, dormitoryId: DORM_A })
    stubAuthLayer({ users: [owner] })
    stubEventReads(event)
    mock.method(eventsRepository, 'removeParticipant', async () => true)
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => [])

    const res = await request(app)
      .delete(`/api/events/${EVENT_ID}/participants/00000000-0000-0000-0000-0000000000f2`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    assert.equal(res.status, 200)
    assert.equal(promote.mock.callCount(), 1)
  })

  it('promotes after an admin removes a participant', async () => {
    const admin = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubEventReads(fakeEvent())
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])
    mock.method(eventsRepository, 'removeParticipant', async () => true)
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => [])

    const res = await request(app)
      .delete(`/api/admin/events/${EVENT_ID}/participants/00000000-0000-0000-0000-0000000000f2`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
    assert.equal(promote.mock.callCount(), 1)
  })

  it('promotes after the participant limit is raised', async () => {
    const event = fakeEvent({ isOnline: false, location: 'Хол', dormitoryId: DORM_A })
    const owner = buildUser({ id: event.creatorId, dormitoryId: DORM_A })
    stubAuthLayer({ users: [owner] })
    stubEventReads(event)
    mock.method(eventsRepository, 'update', async () => event)
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => [])

    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ maxParticipants: 5 })

    assert.equal(res.status, 200)
    assert.equal(promote.mock.callCount(), 1, 'a bigger limit frees seats for the queue')
  })

  it('does NOT promote when the limit is only renamed around (no increase)', async () => {
    const event = fakeEvent({ isOnline: false, location: 'Хол', dormitoryId: DORM_A })
    const owner = buildUser({ id: event.creatorId, dormitoryId: DORM_A })
    stubAuthLayer({ users: [owner] })
    stubEventReads(event)
    mock.method(eventsRepository, 'update', async () => event)
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => [])

    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ title: 'Нова назва' })

    assert.equal(res.status, 200)
    assert.equal(promote.mock.callCount(), 0)
  })

  it('never promotes into an event that has already finished', async () => {
    stubEventReads(fakeEvent({ date: PAST_DATE, time: '10:00:00' }))
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => [])

    const promoted = await eventsService.promoteWaitlist(EVENT_ID)

    assert.deepEqual(promoted, [])
    assert.equal(promote.mock.callCount(), 0)
  })

  it('keeps the promotion even when the Telegram DM fails', async () => {
    const promotedId = '00000000-0000-0000-0000-0000000000aa'
    stubEventReads(fakeEvent())
    mock.method(eventsRepository, 'promoteFromWaitlist', async () => [promotedId])
    mock.method(usersRepository, 'getUsersByIds', async () => [
      {
        id: promotedId,
        telegramId: 900_500,
        firstName: 'Промо',
        registrationStatus: 'approved' as const,
        createdAt: new Date().toISOString(),
        bannedPermanently: false,
      },
    ])
    mock.method(notificationLogRepository, 'log', async () => undefined)

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('Telegram is down')
    }) as typeof fetch

    try {
      const promoted = await eventsService.promoteWaitlist(EVENT_ID)
      assert.deepEqual(promoted, [promotedId], 'promotion must survive a Telegram outage')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('waitlist visibility and moderation', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('never leaks the queue list to an ordinary user', async () => {
    const stranger = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [stranger] })
    stubEventReads(fakeEvent())
    const getIds = mock.method(eventsRepository, 'getWaitlistUserIds', async () => [])

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_OWNER_REQUIRED')
    assert.equal(getIds.mock.callCount(), 0, 'the queue must not even be read')
  })

  it('returns the queue to the organizer in FIFO order', async () => {
    const event = fakeEvent()
    const owner = buildUser({ id: event.creatorId, dormitoryId: DORM_A })
    stubAuthLayer({ users: [owner] })
    stubEventReads(event)
    const first = '00000000-0000-0000-0000-0000000000a1'
    const second = '00000000-0000-0000-0000-0000000000a2'
    mock.method(eventsRepository, 'getWaitlistUserIds', async () => [first, second])
    // Навмисно у зворотному порядку — сервіс має відновити порядок черги.
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [
      { id: second, firstName: 'Другий' },
      { id: first, firstName: 'Перший' },
    ])

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(
      res.body.waitlist.map((entry: { id: string }) => entry.id),
      [first, second],
      'SQL order wins over the batch-fetch order',
    )
  })

  it('lets the organizer drop somebody from the queue', async () => {
    const event = fakeEvent()
    const owner = buildUser({ id: event.creatorId, dormitoryId: DORM_A })
    stubAuthLayer({ users: [owner] })
    stubEventReads(event)
    const leaveWaitlist = mock.method(eventsRepository, 'leaveWaitlist', async () => true)

    const res = await request(app)
      .delete(`/api/events/${EVENT_ID}/waitlist/00000000-0000-0000-0000-0000000000a1`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    assert.equal(res.status, 200)
    assert.equal(leaveWaitlist.mock.callCount(), 1)
  })

  it('refuses a non-organizer dropping somebody from the queue', async () => {
    const stranger = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [stranger] })
    stubEventReads(fakeEvent())
    const leaveWaitlist = mock.method(eventsRepository, 'leaveWaitlist', async () => true)

    const res = await request(app)
      .delete(`/api/events/${EVENT_ID}/waitlist/00000000-0000-0000-0000-0000000000a1`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)

    assert.equal(res.status, 403)
    assert.equal(leaveWaitlist.mock.callCount(), 0)
  })

  it('refuses a non-admin on the admin waitlist routes', async () => {
    const user = buildUser({ dormitoryId: DORM_B })
    stubAuthLayer({ users: [user] })

    const listRes = await request(app)
      .get(`/api/admin/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
    assert.equal(listRes.status, 403)
    assert.equal((listRes.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')

    const removeRes = await request(app)
      .delete(`/api/admin/events/${EVENT_ID}/waitlist/00000000-0000-0000-0000-0000000000a1`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
    assert.equal(removeRes.status, 403)
  })

  it('lets an admin read and moderate the queue of an event they do not own', async () => {
    const admin = buildUser({ dormitoryId: DORM_B })
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubEventReads(fakeEvent())
    mock.method(eventsRepository, 'getWaitlistUserIds', async () => [
      '00000000-0000-0000-0000-0000000000a1',
    ])
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [
      { id: '00000000-0000-0000-0000-0000000000a1', firstName: 'Перший' },
    ])
    const leaveWaitlist = mock.method(eventsRepository, 'leaveWaitlist', async () => true)

    const listRes = await request(app)
      .get(`/api/admin/events/${EVENT_ID}/waitlist`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    assert.equal(listRes.status, 200)
    assert.equal(listRes.body.waitlist.length, 1)

    const removeRes = await request(app)
      .delete(`/api/admin/events/${EVENT_ID}/waitlist/00000000-0000-0000-0000-0000000000a1`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    assert.equal(removeRes.status, 200)
    assert.equal(leaveWaitlist.mock.callCount(), 1)
  })

  it('exposes waitlistCount and the viewer position on the event response', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const event = fakeEvent()
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    mock.method(eventsRepository, 'findWaitlistCounts', async () => new Map([[EVENT_ID, 3]]))
    mock.method(eventsRepository, 'findWaitlistPositions', async () => new Map([[EVENT_ID, 2]]))
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.event.waitlistCount, 3)
    assert.equal(res.body.event.viewerWaitlistPosition, 2)
    // Повного списку черги у відповіді бути не повинно.
    assert.equal('waitlist' in res.body.event, false)
  })

  it('omits the viewer position for somebody who is not queued', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    mock.method(eventsRepository, 'findById', async () => fakeEvent())
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    mock.method(eventsRepository, 'findWaitlistCounts', async () => new Map([[EVENT_ID, 3]]))
    mock.method(eventsRepository, 'findWaitlistPositions', async () => new Map())
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.body.event.waitlistCount, 3)
    assert.equal(res.body.event.viewerWaitlistPosition, undefined)
  })

  it('rejects unauthenticated waitlist requests with 401', async () => {
    const res = await request(app).post(`/api/events/${EVENT_ID}/waitlist`)
    assert.equal(res.status, 401)
    assert.equal((res.body as ApiErrorBody).error.code, 'UNAUTHORIZED')
  })

  it('rejects a malformed event id before touching the repository', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const findById = mock.method(eventsRepository, 'findById', async () => null)

    const res = await request(app)
      .post('/api/events/not-a-uuid/waitlist')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(findById.mock.callCount(), 0)
  })
})

describe('deleting a user promotes the queues of their events', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('collects the affected events BEFORE deletion and promotes them after', async () => {
    const admin = buildUser({ dormitoryId: DORM_A })
    const target = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [admin, target], admins: [admin.id] })
    stubEventReads(fakeEvent())

    const callOrder: string[] = []
    mock.method(eventsRepository, 'findEventIdsWithParticipant', async () => {
      callOrder.push('collect')
      return [EVENT_ID]
    })
    mock.method(usersRepository, 'getAdminUserById', async () => ({
      id: target.id,
      telegramId: target.telegramId,
      firstName: target.firstName,
      registrationStatus: 'approved' as const,
      createdAt: new Date().toISOString(),
      bannedPermanently: false,
    }))
    mock.method(eventsRepository, 'removeByCreatorId', async () => undefined)
    mock.method(usersRepository, 'remove', async () => {
      callOrder.push('delete')
      return true
    })
    const promote = mock.method(eventsRepository, 'promoteFromWaitlist', async () => {
      callOrder.push('promote')
      return []
    })

    const res = await request(app)
      .delete(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
    assert.equal(promote.mock.callCount(), 1)
    assert.deepEqual(
      callOrder,
      ['collect', 'delete', 'promote'],
      'affected events must be read before the cascade wipes the rows',
    )
  })
})
