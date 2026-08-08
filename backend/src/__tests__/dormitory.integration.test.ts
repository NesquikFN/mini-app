/**
 * Integration tests for the dormitories system — against the real Express
 * app + live Supabase (see auth.integration.test.ts for the same
 * pattern/setup). Run via `npm run test:integration --workspace=backend`.
 *
 * Uses telegram_id ranges far outside seed data / DEV_AUTH demo user /
 * other integration suites, so it never collides with them.
 *
 * REQUIRES database/migrations/0004_dormitories.sql to already be
 * applied — this file has no way to run DDL itself.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from '../app'
import { query } from '../config/db'
import { buildValidInitData, nowSeconds, telegramUserField } from '../test-utils/telegramInitData'

const BOT_TOKEN = process.env.BOT_TOKEN

before(() => {
  assert.ok(
    BOT_TOKEN,
    'BOT_TOKEN must be set for integration tests — run via `npm run test:integration`',
  )
})

function validInitDataFor(telegramId: number): string {
  return buildValidInitData(
    {
      auth_date: String(nowSeconds()),
      user: telegramUserField(telegramId, 'Гуртожитковий Тест', `dormitory_test_${telegramId}`),
      query_id: 'AAH_dormitory',
    },
    BOT_TOKEN as string,
  )
}

async function authenticate(telegramId: number): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/telegram')
    .send({ initData: validInitDataFor(telegramId) })
  return { token: res.body.token, userId: res.body.user.id }
}

async function fetchDormitoryIds(token: string): Promise<string[]> {
  const res = await request(app).get('/api/dormitories').set('Authorization', `Bearer ${token}`)
  return (res.body.dormitories as { id: string }[]).map((d) => d.id)
}

describe('GET /api/dormitories', () => {
  const TELEGRAM_ID = 900_000_201
  let userId: string | undefined

  after(async () => {
    if (userId) await query('delete from users where id = $1', [userId])
  })

  it('returns a non-empty list of dormitories with id + name', async () => {
    const { token, userId: id } = await authenticate(TELEGRAM_ID)
    userId = id

    const res = await request(app).get('/api/dormitories').set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.dormitories))
    assert.ok(res.body.dormitories.length > 0, 'expected at least one seeded dormitory')
    for (const dormitory of res.body.dormitories) {
      assert.equal(typeof dormitory.id, 'string')
      assert.equal(typeof dormitory.name, 'string')
    }
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/dormitories')
    assert.equal(res.status, 401)
  })
})

describe('dormitory: user onboarding', () => {
  const TELEGRAM_ID = 900_000_202
  let userId: string | undefined
  let dormitoryIds: string[] = []

  after(async () => {
    if (userId) await query('delete from users where id = $1', [userId])
  })

  it('a brand-new user has no dormitory until they choose one', async () => {
    const { token, userId: id } = await authenticate(TELEGRAM_ID)
    userId = id
    dormitoryIds = await fetchDormitoryIds(token)
    assert.ok(dormitoryIds.length >= 2, 'test needs at least 2 seeded dormitories')

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.user.dormitoryId, undefined)
  })

  it('lets the user choose a dormitory and persists it', async () => {
    const { token } = await authenticate(TELEGRAM_ID)

    const patchRes = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ dormitoryId: dormitoryIds[0] })

    assert.equal(patchRes.status, 200)
    assert.equal(patchRes.body.user.dormitoryId, dormitoryIds[0])

    const meRes = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)
    assert.equal(meRes.body.user.dormitoryId, dormitoryIds[0])
  })

  it('re-authenticating the same Telegram user does not create a duplicate and keeps dormitory', async () => {
    const first = await authenticate(TELEGRAM_ID)
    const second = await authenticate(TELEGRAM_ID)

    assert.equal(first.userId, second.userId)

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${second.token}`)
    assert.equal(res.body.user.dormitoryId, dormitoryIds[0])
  })

  it('rejects a dormitoryId that does not exist', async () => {
    const { token } = await authenticate(TELEGRAM_ID)

    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ dormitoryId: '00000000-0000-0000-0000-000000000000' })

    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'DORMITORY_NOT_FOUND')
  })

  it('rejects a malformed dormitoryId', async () => {
    const { token } = await authenticate(TELEGRAM_ID)

    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ dormitoryId: 'not-a-uuid' })

    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  })
})

describe('dormitory: event creation is server-controlled', () => {
  const TELEGRAM_ID = 900_000_203
  let userId: string | undefined
  let createdEventId: string | undefined
  let dormitoryIds: string[] = []

  after(async () => {
    if (createdEventId) await query('delete from events where id = $1', [createdEventId])
    if (userId) await query('delete from users where id = $1', [userId])
  })

  it('blocks event creation before a dormitory is chosen', async () => {
    const { token, userId: id } = await authenticate(TELEGRAM_ID)
    userId = id
    dormitoryIds = await fetchDormitoryIds(token)

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Подія без гуртожитку',
        description: '',
        date: '2026-12-31',
        time: '12:00',
        location: 'Test room',
        maxParticipants: 3,
      })

    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'DORMITORY_REQUIRED')
  })

  it("stamps a created event with the creator's dormitory, and ignores a different dormitoryId sent in the body", async () => {
    const { token } = await authenticate(TELEGRAM_ID)

    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ dormitoryId: dormitoryIds[0] })

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Подія з гуртожитком',
        description: '',
        date: '2026-12-31',
        time: '12:00',
        location: 'Test room',
        maxParticipants: 3,
        // Спроба підмінити гуртожиток через тіло запиту — backend має
        // проігнорувати й підставити власний dormitoryId користувача.
        dormitoryId: dormitoryIds[1],
      })

    assert.equal(createRes.status, 201)
    createdEventId = createRes.body.event.id
    assert.equal(createRes.body.event.dormitoryId, dormitoryIds[0])
    assert.notEqual(createRes.body.event.dormitoryId, dormitoryIds[1])

    const detailRes = await request(app)
      .get(`/api/events/${createdEventId}`)
      .set('Authorization', `Bearer ${token}`)
    assert.equal(detailRes.body.event.dormitoryId, dormitoryIds[0])
  })
})

describe('dormitory: events list filtering (scope)', () => {
  const TELEGRAM_ID_A = 900_000_204
  const TELEGRAM_ID_B = 900_000_205
  let userIdA: string | undefined
  let userIdB: string | undefined
  let eventIdA: string | undefined
  let eventIdB: string | undefined

  after(async () => {
    if (eventIdA) await query('delete from events where id = $1', [eventIdA])
    if (eventIdB) await query('delete from events where id = $1', [eventIdB])
    if (userIdA) await query('delete from users where id = $1', [userIdA])
    if (userIdB) await query('delete from users where id = $1', [userIdB])
  })

  it('scope=mine only returns the caller dormitory events; scope=all returns both', async () => {
    const a = await authenticate(TELEGRAM_ID_A)
    userIdA = a.userId
    const b = await authenticate(TELEGRAM_ID_B)
    userIdB = b.userId

    const dormitoryIds = await fetchDormitoryIds(a.token)
    assert.ok(dormitoryIds.length >= 2, 'test needs at least 2 seeded dormitories')

    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ dormitoryId: dormitoryIds[0] })
    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ dormitoryId: dormitoryIds[1] })

    const createA = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        title: 'Подія гуртожитку A',
        description: '',
        date: '2026-12-30',
        time: '10:00',
        location: 'Room A',
        maxParticipants: 5,
      })
    eventIdA = createA.body.event.id

    const createB = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        title: 'Подія гуртожитку B',
        description: '',
        date: '2026-12-30',
        time: '11:00',
        location: 'Room B',
        maxParticipants: 5,
      })
    eventIdB = createB.body.event.id

    const mineRes = await request(app)
      .get('/api/events?scope=mine')
      .set('Authorization', `Bearer ${a.token}`)
    const mineIds = mineRes.body.events.map((e: { id: string }) => e.id)
    assert.ok(mineIds.includes(eventIdA), "should include caller's own dormitory event")
    assert.ok(!mineIds.includes(eventIdB), 'should NOT include another dormitory event')

    const allRes = await request(app)
      .get('/api/events?scope=all')
      .set('Authorization', `Bearer ${a.token}`)
    const allIds = allRes.body.events.map((e: { id: string }) => e.id)
    assert.ok(allIds.includes(eventIdA))
    assert.ok(allIds.includes(eventIdB))

    // Default (no scope param) behaves like scope=mine.
    const defaultRes = await request(app).get('/api/events').set('Authorization', `Bearer ${a.token}`)
    const defaultIds = defaultRes.body.events.map((e: { id: string }) => e.id)
    assert.ok(defaultIds.includes(eventIdA))
    assert.ok(!defaultIds.includes(eventIdB))
  })
})
