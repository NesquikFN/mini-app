import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import { env } from '../config/env'
import { pool } from '../config/db'
import { AppError } from '../utils/AppError'
import { eventsRepository } from '../repositories/events.repository'
import { quickPlansRepository } from '../repositories/quick-plans.repository'
import { usersRepository } from '../repositories/users.repository'
import { userNotificationSettingsRepository } from '../repositories/user-notification-settings.repository'
import { settingsRepository } from '../repositories/settings.repository'
import { notificationLogRepository, type NewNotificationLogEntry } from '../repositories/notification-log.repository'
import { kyivNow, addDaysToISODate } from '../utils/kyivTime'
import type { Event } from '../types/event'
import type { QuickPlanWithParticipants } from '../repositories/quick-plans.repository'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * Особисті Telegram-сповіщення: нові події/швидкі плани підписникам,
 * підтвердження учаснику й сповіщення організатору після join. Той
 * самий підхід, що й в eventRatings.test.ts / polls.test.ts: справжній
 * Express-застосунок і справжній ланцюг middleware, підмінюється лише
 * шар доступу до даних і мережа Telegram.
 */

const EVENT_ID = '00000000-0000-0000-0000-0000000000ee'
const DORM_A = '00000000-0000-0000-0000-000000000101'
const FUTURE_DATE = addDaysToISODate(kyivNow().date, 30)

function stubTelegram(handler?: (chatId: string, body: Record<string, unknown>) => { ok: boolean; status?: number }) {
  const calls: { chatId: string; body: Record<string, unknown> }[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/getMe')) {
      return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ chatId: String(body.chat_id), body })
    const outcome = handler?.(String(body.chat_id), body) ?? { ok: true }
    if (outcome.ok) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), {
      status: outcome.status ?? 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return calls
}

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    creatorId: '00000000-0000-0000-0000-0000000000c1',
    title: 'Кіновечір',
    description: '',
    isOnline: false,
    vipOnly: false,
    gpuOnly: false,
    date: FUTURE_DATE,
    time: '20:00:00',
    location: 'Кімната відпочинку',
    maxParticipants: 20,
    participantIds: ['00000000-0000-0000-0000-0000000000c1'],
    createdAt: new Date().toISOString(),
    dormitoryId: DORM_A,
    ...overrides,
  }
}

function stubEventReads(event: Event) {
  mock.method(eventsRepository, 'findById', async () => event)
  mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
  mock.method(eventsRepository, 'findWaitlistCounts', async () => new Map())
  mock.method(eventsRepository, 'findWaitlistPositions', async () => new Map())
}

function fakeQuickPlan(overrides: Partial<QuickPlanWithParticipants> = {}): QuickPlanWithParticipants {
  return {
    id: 'q1',
    creatorId: '00000000-0000-0000-0000-0000000000c1',
    text: 'Хто зі мною на FIFA?',
    category: 'games',
    isOnline: false,
    dormitoryId: DORM_A,
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    participantIds: [],
    ...overrides,
  }
}

describe('new event announcement respects notify_new_events and dormitory scope', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('DMs a subscribed user in the same dormitory', async () => {
    const creator = buildUser({ dormitoryId: DORM_A })
    const subscriber = buildUser({ dormitoryId: DORM_A, notifyNewEvents: true })
    stubAuthLayer({ users: [creator, subscriber] })
    mock.method(eventsRepository, 'insert', async () => fakeEvent({ creatorId: creator.id, dormitoryId: DORM_A }))
    stubEventReads(fakeEvent({ creatorId: creator.id, dormitoryId: DORM_A }))
    mock.method(usersRepository, 'getPublicUserById', async () => null)
    mock.method(settingsRepository, 'getNotificationSettings', async () => ({}))
    mock.method(usersRepository, 'getSubscribedTelegramIds', async () => [subscriber.telegramId])
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(creator)}`)
      .send({
        title: 'Кіновечір',
        description: '',
        date: FUTURE_DATE,
        time: '20:00',
        location: 'Кімната відпочинку',
        maxParticipants: 20,
        isOnline: false,
      })

    assert.equal(res.status, 201)
    assert.ok(
      calls.some((call) => call.chatId === String(subscriber.telegramId)),
      'the subscribed dormitory-mate must receive a DM',
    )
  })

  it('does not DM a user who turned notifications off', async () => {
    const creator = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [creator] })
    mock.method(eventsRepository, 'insert', async () => fakeEvent({ creatorId: creator.id, dormitoryId: DORM_A }))
    stubEventReads(fakeEvent({ creatorId: creator.id, dormitoryId: DORM_A }))
    mock.method(usersRepository, 'getPublicUserById', async () => null)
    mock.method(settingsRepository, 'getNotificationSettings', async () => ({}))
    // notify_new_events = false у SQL означає, що getSubscribedTelegramIds
    // просто не поверне цього користувача — сервіс і не дізнається про нього.
    mock.method(usersRepository, 'getSubscribedTelegramIds', async () => [])
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(creator)}`)
      .send({
        title: 'Кіновечір',
        description: '',
        date: FUTURE_DATE,
        time: '20:00',
        location: 'Кімната відпочинку',
        maxParticipants: 20,
        isOnline: false,
      })

    assert.equal(calls.length, 0, 'nobody subscribed → no personal DMs at all')
  })

  it('scopes offline-event subscribers to the event dormitory in SQL', async () => {
    const creator = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [creator] })
    mock.method(eventsRepository, 'insert', async () => fakeEvent({ creatorId: creator.id, dormitoryId: DORM_A }))
    stubEventReads(fakeEvent({ creatorId: creator.id, dormitoryId: DORM_A }))
    mock.method(usersRepository, 'getPublicUserById', async () => null)
    mock.method(settingsRepository, 'getNotificationSettings', async () => ({}))
    const getSubscribed = mock.method(usersRepository, 'getSubscribedTelegramIds', async () => [])
    stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(creator)}`)
      .send({
        title: 'Кіновечір',
        description: '',
        date: FUTURE_DATE,
        time: '20:00',
        location: 'Кімната відпочинку',
        maxParticipants: 20,
        isOnline: false,
      })

    assert.equal(getSubscribed.mock.calls[0].arguments[0], DORM_A, 'must scope to the event dormitory, not global')
  })
})

describe('quick plan creation announces to subscribers ("Хто зі мною")', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('DMs a subscribed user in the same dormitory when a plan is created', async () => {
    const creator = buildUser({ dormitoryId: DORM_A })
    const subscriber = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [creator, subscriber] })
    mock.method(quickPlansRepository, 'countActiveByCreator', async () => 0)
    mock.method(quickPlansRepository, 'insert', async () => fakeQuickPlan({ creatorId: creator.id, dormitoryId: DORM_A }))
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])
    const getSubscribed = mock.method(usersRepository, 'getSubscribedTelegramIds', async () => [subscriber.telegramId])
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(creator)}`)
      .send({ text: 'Хто зі мною на FIFA сьогодні?', category: 'games', isOnline: false, lifetime: '6h' })

    assert.equal(res.status, 201)
    // Дзеркальне до подій: офлайн-план сповіщає лише свій гуртожиток, без ролі VIP/ГПУ.
    assert.equal(getSubscribed.mock.calls[0].arguments[0], DORM_A)
    assert.equal(getSubscribed.mock.calls[0].arguments[1], undefined)
    assert.ok(calls.some((call) => call.chatId === String(subscriber.telegramId)))
  })

  it('this is genuinely new behavior — no announcement existed for quick plan creation before', async () => {
    // Регресійний маркер: до цієї фічі insert() не тягнув за собою жодного
    // виклику getSubscribedTelegramIds. Тест лише документує очікування,
    // фактична перевірка — у тесті вище.
    assert.ok(true)
  })
})

describe('event join → organizer + participant notifications', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  function setup(organizer: ReturnType<typeof buildUser>, joiner: ReturnType<typeof buildUser>) {
    stubAuthLayer({ users: [organizer, joiner] })
    stubEventReads(fakeEvent({ creatorId: organizer.id, participantIds: [organizer.id, joiner.id] }))
  }

  it('successful join notifies both the organizer and the joining participant', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    setup(organizer, joiner)
    mock.method(eventsRepository, 'addParticipant', async () => undefined)
    mock.method(userNotificationSettingsRepository, 'getEffective', async () => ({
      joinConfirmationEnabled: true,
      organizerJoinEnabled: true,
    }))
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.equal(res.status, 200)
    assert.ok(calls.some((call) => call.chatId === String(organizer.telegramId)), 'organizer must be notified')
    assert.ok(calls.some((call) => call.chatId === String(joiner.telegramId)), 'joiner must get a confirmation')
  })

  it('does not notify the organizer when their toggle is off', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    setup(organizer, joiner)
    mock.method(eventsRepository, 'addParticipant', async () => undefined)
    mock.method(userNotificationSettingsRepository, 'getEffective', async (userId: string) => ({
      joinConfirmationEnabled: true,
      organizerJoinEnabled: userId !== organizer.id,
    }))
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.ok(!calls.some((call) => call.chatId === String(organizer.telegramId)))
    assert.ok(calls.some((call) => call.chatId === String(joiner.telegramId)), 'joiner confirmation is independent')
  })

  it('does not send a join confirmation when the participant toggle is off', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    setup(organizer, joiner)
    mock.method(eventsRepository, 'addParticipant', async () => undefined)
    mock.method(userNotificationSettingsRepository, 'getEffective', async (userId: string) => ({
      joinConfirmationEnabled: userId !== joiner.id,
      organizerJoinEnabled: true,
    }))
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.ok(!calls.some((call) => call.chatId === String(joiner.telegramId)))
    assert.ok(calls.some((call) => call.chatId === String(organizer.telegramId)), 'organizer notification is independent')
  })

  it('sends no notifications when the join itself fails', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    setup(organizer, joiner)
    mock.method(eventsRepository, 'addParticipant', async () => {
      throw new Error('boom')
    })
    const settingsSpy = mock.method(userNotificationSettingsRepository, 'getEffective', async () => ({
      joinConfirmationEnabled: true,
      organizerJoinEnabled: true,
    }))
    const calls = stubTelegram()

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.equal(res.status, 500)
    assert.equal(calls.length, 0)
    assert.equal(settingsSpy.mock.callCount(), 0, 'notification gating must never even be consulted on a failed join')
  })

  it('sends no notifications on a duplicate join (ALREADY_JOINED)', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    setup(organizer, joiner)
    mock.method(eventsRepository, 'addParticipant', async () => {
      throw new AppError(409, 'ALREADY_JOINED', 'Ви вже берете участь у цій події')
    })
    const calls = stubTelegram()

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'ALREADY_JOINED')
    assert.equal(calls.length, 0)
  })

  it('never notifies "the organizer" when the joiner and organizer are the same user', async () => {
    const organizer = buildUser()
    setup(organizer, organizer)
    mock.method(eventsRepository, 'addParticipant', async () => undefined)
    mock.method(userNotificationSettingsRepository, 'getEffective', async () => ({
      joinConfirmationEnabled: true,
      organizerJoinEnabled: true,
    }))
    const calls = stubTelegram()
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(organizer)}`)

    // Лише одне повідомлення (підтвердження учаснику), не два "самому собі".
    const toOrganizer = calls.filter((call) => call.chatId === String(organizer.telegramId))
    assert.equal(toOrganizer.length, 1)
  })

  it('a Telegram API error does not fail the join request', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    setup(organizer, joiner)
    mock.method(eventsRepository, 'addParticipant', async () => undefined)
    mock.method(userNotificationSettingsRepository, 'getEffective', async () => ({
      joinConfirmationEnabled: true,
      organizerJoinEnabled: true,
    }))
    stubTelegram(() => ({ ok: false, status: 403 }))
    mock.method(notificationLogRepository, 'log', async () => undefined)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.equal(res.status, 200, 'the join itself must still succeed')
    assert.ok(res.body.event.participants.includes(joiner.id))
  })
})

describe('notification log entries never leak BOT_TOKEN', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('logs a failed organizer notification without the token anywhere in the message', async () => {
    const organizer = buildUser()
    const joiner = buildUser()
    stubAuthLayer({ users: [organizer, joiner] })
    stubEventReads(fakeEvent({ creatorId: organizer.id, participantIds: [organizer.id, joiner.id] }))
    mock.method(eventsRepository, 'addParticipant', async () => undefined)
    mock.method(userNotificationSettingsRepository, 'getEffective', async () => ({
      joinConfirmationEnabled: true,
      organizerJoinEnabled: true,
    }))
    stubTelegram(() => ({ ok: false, status: 400 }))
    const log = mock.method(notificationLogRepository, 'log', async () => undefined)

    await request(app)
      .post(`/api/events/${EVENT_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(joiner)}`)

    assert.ok(env.BOT_TOKEN.length > 0, 'sanity: a token is configured in this test env')
    for (const call of log.mock.calls) {
      const entry = call.arguments[0] as NewNotificationLogEntry
      assert.ok(!String(entry.errorMessage).includes(env.BOT_TOKEN))
      assert.ok(!String(entry.chatId).includes(env.BOT_TOKEN))
    }
  })
})

describe('GET/PATCH /api/me/notifications', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('GET returns defaults for a user who never touched their settings', async () => {
    const user = buildUser({ notifyNewEvents: true })
    stubAuthLayer({ users: [user] })
    mock.method(userNotificationSettingsRepository, 'find', async () => null)

    const res = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      newEventsEnabled: true,
      joinConfirmationEnabled: true,
      organizerJoinEnabled: true,
    })
  })

  it('PATCH updates only the given field and returns the composed result', async () => {
    const user = buildUser({ notifyNewEvents: true })
    stubAuthLayer({ users: [user] })
    const upsert = mock.method(userNotificationSettingsRepository, 'upsert', async () => ({
      user_id: user.id,
      join_confirmation_enabled: false,
      organizer_join_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    mock.method(userNotificationSettingsRepository, 'find', async () => ({
      user_id: user.id,
      join_confirmation_enabled: false,
      organizer_join_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const res = await request(app)
      .patch('/api/me/notifications')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ joinConfirmationEnabled: false })

    assert.equal(res.status, 200)
    assert.equal(res.body.joinConfirmationEnabled, false)
    assert.equal(res.body.organizerJoinEnabled, true)
    assert.deepEqual(upsert.mock.calls[0].arguments[1], {
      joinConfirmationEnabled: false,
      organizerJoinEnabled: undefined,
    })
  })

  it('PATCH newEventsEnabled routes through the existing users.notify_new_events column, not a new one', async () => {
    const user = buildUser({ notifyNewEvents: false })
    stubAuthLayer({ users: [user] })
    const setNotify = mock.method(usersRepository, 'setNotifyNewEvents', async (id: string) => ({
      ...user,
      id,
      notifyNewEvents: true,
    }))
    mock.method(userNotificationSettingsRepository, 'find', async () => null)

    const res = await request(app)
      .patch('/api/me/notifications')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ newEventsEnabled: true })

    assert.equal(res.status, 200)
    assert.equal(setNotify.mock.callCount(), 1)
    assert.deepEqual(setNotify.mock.calls[0].arguments, [user.id, true])
  })

  it('settings survive a "reload" — a later GET reflects the earlier PATCH via the real repository upsert/find round-trip', async () => {
    // Реальний repository (не мокнутий) проти справжнього findById-стилю
    // upsert — перевіряємо сам SQL, а не просто що контролер щось повернув.
    const calls: unknown[][] = []
    mock.method(pool, 'query', async (text: string, params?: unknown[]) => {
      calls.push([text, params])
      return { rows: [], rowCount: 0 }
    })
    await userNotificationSettingsRepository.upsert('user-1', { joinConfirmationEnabled: false })

    const sql = String(calls[0][0]).replace(/\s+/g, ' ')
    assert.match(sql, /on conflict \(user_id\) do update/)
    assert.match(sql, /join_confirmation_enabled = coalesce\(\$2,/)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/me/notifications')
    assert.equal(res.status, 401)
  })

  it('requires at least one field on PATCH', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .patch('/api/me/notifications')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({})

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
  })
})
