/**
 * Integration tests against the real Express app + live Supabase (this
 * project has no DB mocking layer — see backend/.env). Run via
 * `npm run test:integration --workspace=backend`, which injects a
 * dedicated BOT_TOKEN/JWT_SECRET for the test process only (see
 * package.json) so these never depend on — or touch — the developer's
 * real bot credentials.
 *
 * Uses a telegram_id far outside the seed-data range so it never
 * collides with database/seed.sql or the DEV_AUTH demo user.
 *
 * REQUIRES database/migrations/0004_dormitories.sql to already be
 * applied — event creation now needs a dormitory on the user.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from '../app'
import { supabase } from '../config/supabase'
import { buildValidInitData, nowSeconds, telegramUserField } from '../test-utils/telegramInitData'

const BOT_TOKEN = process.env.BOT_TOKEN
const TEST_TELEGRAM_ID = 900_000_001

before(() => {
  assert.ok(
    BOT_TOKEN,
    'BOT_TOKEN must be set for integration tests — run via `npm run test:integration`',
  )
})

function validInitDataFor(telegramId: number, authDateOverride?: number): string {
  return buildValidInitData(
    {
      auth_date: String(authDateOverride ?? nowSeconds()),
      user: telegramUserField(telegramId, 'Тестовий Юзер', 'integration_test_user'),
      query_id: 'AAH_integration',
    },
    BOT_TOKEN as string,
  )
}

describe('POST /api/auth/telegram', () => {
  it('authenticates a brand-new Telegram user and creates a DB row', async () => {
    const res = await request(app)
      .post('/api/auth/telegram')
      .send({ initData: validInitDataFor(TEST_TELEGRAM_ID) })

    assert.equal(res.status, 200)
    assert.equal(res.body.user.telegramId, TEST_TELEGRAM_ID)
    assert.ok(res.body.token)
    assert.ok(res.body.user.id)
  })

  it('re-authenticates the same Telegram user without creating a duplicate', async () => {
    const first = await request(app)
      .post('/api/auth/telegram')
      .send({ initData: validInitDataFor(TEST_TELEGRAM_ID) })

    const second = await request(app)
      .post('/api/auth/telegram')
      .send({ initData: validInitDataFor(TEST_TELEGRAM_ID) })

    assert.equal(first.body.user.id, second.body.user.id)
  })

  it('rejects modified initData (tampered hash)', async () => {
    const initData = validInitDataFor(TEST_TELEGRAM_ID)
    // Cyrillic fields are percent-encoded in the query string, so tamper
    // the telegram id instead — it's plain digits and stays untouched by
    // encodeURIComponent, making the substitution unambiguous.
    const tampered = initData.replace(String(TEST_TELEGRAM_ID), String(TEST_TELEGRAM_ID + 1))

    const res = await request(app).post('/api/auth/telegram').send({ initData: tampered })

    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'INVALID_HASH')
  })

  it('rejects expired initData', async () => {
    const twoDaysAgo = nowSeconds() - 2 * 24 * 60 * 60
    const initData = validInitDataFor(TEST_TELEGRAM_ID, twoDaysAgo)

    const res = await request(app).post('/api/auth/telegram').send({ initData })

    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'EXPIRED_INIT_DATA')
  })
})

describe('authenticated API access', () => {
  let token: string
  let userId: string
  let createdEventId: string | undefined

  before(async () => {
    const res = await request(app)
      .post('/api/auth/telegram')
      .send({ initData: validInitDataFor(TEST_TELEGRAM_ID) })
    token = res.body.token
    userId = res.body.user.id

    // Event creation now requires a dormitory (see
    // dormitory.integration.test.ts) — this suite creates events below.
    const dormitoriesRes = await request(app)
      .get('/api/dormitories')
      .set('Authorization', `Bearer ${token}`)
    const dormitoryId: string = dormitoriesRes.body.dormitories[0].id
    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ dormitoryId })
  })

  // Regular users have no self-service delete endpoint (only admins do —
  // see admin.integration.test.ts), so the row this suite creates is
  // cleaned up directly here rather than left for a human to find.
  after(async () => {
    if (createdEventId) {
      await supabase.from('events').delete().eq('id', createdEventId)
    }
  })

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/me')
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'UNAUTHORIZED')
  })

  it('rejects requests with an invalid/garbage session token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not-a-real-token')
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'INVALID_SESSION')
  })

  it('GET /api/me returns the authenticated user', async () => {
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.user.id, userId)
    assert.equal(res.body.user.telegramId, TEST_TELEGRAM_ID)
  })

  it('creates an event, then leaves and re-joins it as the authenticated user', async () => {
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Integration test event',
        description: 'Створено автотестом Stage 7, безпечно видалити.',
        date: '2026-12-31',
        time: '12:00',
        location: 'Test room',
        maxParticipants: 3,
      })

    assert.equal(createRes.status, 201)
    const eventId: string = createRes.body.event.id
    createdEventId = eventId
    // Creator auto-joins on creation (see events.repository.insert).
    assert.ok(createRes.body.event.participants.includes(userId))

    const leaveRes = await request(app)
      .delete(`/api/events/${eventId}/leave`)
      .set('Authorization', `Bearer ${token}`)
    assert.equal(leaveRes.status, 200)
    assert.ok(!leaveRes.body.event.participants.includes(userId))

    const joinRes = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${token}`)
    assert.equal(joinRes.status, 200)
    assert.ok(joinRes.body.event.participants.includes(userId))
  })

  it('GET /api/events/:id includes public creator/participants info without leaking private fields', async () => {
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Event detail members test',
        description: 'Створено автотестом, безпечно видалити.',
        date: '2026-12-29',
        time: '11:00',
        location: 'Test room',
        maxParticipants: 3,
      })
    assert.equal(createRes.status, 201)
    const eventId: string = createRes.body.event.id

    try {
      const res = await request(app)
        .get(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`)
      assert.equal(res.status, 200)

      // Existing lightweight shape stays untouched (used by list/join/leave
      // and by the frontend's shared EventsContext) — this is additive.
      assert.equal(res.body.event.creatorId, userId)
      assert.ok(Array.isArray(res.body.event.participants))
      assert.ok(res.body.event.participants.includes(userId))

      // New enriched fields: creator + full participant profiles.
      assert.equal(res.body.creator.id, userId)
      assert.equal(res.body.creator.firstName, 'Тестовий Юзер')
      assert.ok(Array.isArray(res.body.participants))
      assert.ok(res.body.participants.some((p: { id: string }) => p.id === userId))

      // Only the public-safe fields — nothing that could leak auth
      // internals or other private data. dormitoryId is intentional
      // (see PublicUser in types/user.ts) — this app is built entirely
      // around dormitories, it's not sensitive.
      const allowedKeys = new Set(['id', 'firstName', 'username', 'photoUrl', 'dormitoryId'])
      for (const member of [res.body.creator, ...res.body.participants]) {
        for (const key of Object.keys(member)) {
          assert.ok(allowedKeys.has(key), `unexpected field "${key}" on a public member`)
        }
      }
      const serialized = JSON.stringify(res.body)
      for (const forbidden of ['telegramId', 'token', 'session', 'BOT_TOKEN', 'JWT_SECRET', 'service_role']) {
        assert.ok(!serialized.includes(forbidden), `response leaked "${forbidden}"`)
      }
    } finally {
      await supabase.from('events').delete().eq('id', eventId)
    }
  })

  it('GET /api/me/events includes events created by the authenticated user', async () => {
    const res = await request(app).get('/api/me/events').set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.created))
    assert.ok(res.body.created.some((event: { creatorId: string }) => event.creatorId === userId))
  })
})
