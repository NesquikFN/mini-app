/**
 * Integration tests for the admin API against the real Express app + live
 * Supabase (see auth.integration.test.ts for the same rationale — this
 * project has no DB mocking layer). Run via
 * `npm run test:integration --workspace=backend`.
 *
 * Grants admin rights the same way an operator would in production (an
 * insert into admin_users — see README "Адмін-панель"), just done here
 * via the Supabase client instead of the SQL Editor, so the test is
 * self-contained.
 *
 * REQUIRES database/migrations/0002_admin_users.sql to already be applied
 * to the Supabase project — this file has no way to run DDL itself.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from '../app'
import { supabase } from '../config/supabase'
import { buildValidInitData, nowSeconds, telegramUserField } from '../test-utils/telegramInitData'

const BOT_TOKEN = process.env.BOT_TOKEN
const REGULAR_TELEGRAM_ID = 900_000_002
const ADMIN_TELEGRAM_ID = 900_000_003

before(() => {
  assert.ok(
    BOT_TOKEN,
    'BOT_TOKEN must be set for integration tests — run via `npm run test:integration`',
  )
})

function initDataFor(telegramId: number, name: string): string {
  return buildValidInitData(
    {
      auth_date: String(nowSeconds()),
      user: telegramUserField(telegramId, name, `admin_test_${telegramId}`),
      query_id: 'AAH_admin_test',
    },
    BOT_TOKEN as string,
  )
}

async function authenticate(telegramId: number, name: string) {
  const res = await request(app)
    .post('/api/auth/telegram')
    .send({ initData: initDataFor(telegramId, name) })
  return { token: res.body.token as string, userId: res.body.user.id as string }
}

describe('admin API access control', () => {
  let regularToken: string
  let adminToken: string
  let adminUserId: string

  before(async () => {
    const regular = await authenticate(REGULAR_TELEGRAM_ID, 'Звичайний Юзер')
    regularToken = regular.token

    const admin = await authenticate(ADMIN_TELEGRAM_ID, 'Адмін Юзер')
    adminToken = admin.token
    adminUserId = admin.userId

    // Grant admin rights — the same effect as the README's manual SQL
    // Editor insert, done programmatically so this test is self-contained.
    const { error } = await supabase
      .from('admin_users')
      .upsert({ user_id: adminUserId }, { onConflict: 'user_id' })
    assert.equal(
      error,
      null,
      `could not seed admin_users — has migration 0002_admin_users.sql been applied? ${error?.message}`,
    )
  })

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/stats')
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'UNAUTHORIZED')
  })

  it('rejects an authenticated non-admin user with 403', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${regularToken}`)
    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'FORBIDDEN')
  })

  it('rejects a non-admin from mutating endpoints too (POST /api/admin/events)', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({
        title: 'should not be created',
        date: '2026-12-31',
        time: '12:00',
        location: 'x',
        maxParticipants: 1,
      })
    assert.equal(res.status, 403)
  })

  it('grants a real admin access to GET /api/admin/stats', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    assert.equal(res.status, 200)
    for (const key of [
      'totalUsers',
      'totalEvents',
      'eventsToday',
      'totalParticipations',
      'activeUsers',
    ]) {
      assert.equal(typeof res.body[key], 'number', `${key} should be a number`)
    }
  })

  it('lets an admin list all users with registration data', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.users))
    const self = res.body.users.find((u: { id: string }) => u.id === adminUserId)
    assert.ok(self, 'admin should appear in the users list')
    assert.equal(self.telegramId, ADMIN_TELEGRAM_ID)
    assert.ok(self.createdAt)
  })

  it('lets an admin create, update, view, and delete an event, and remove a participant', async () => {
    const createRes = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin-created event',
        description: 'Створено адмін-тестом, безпечно видалити.',
        date: '2026-12-30',
        time: '10:00',
        location: 'Admin room',
        maxParticipants: 5,
      })
    assert.equal(createRes.status, 201)
    const eventId: string = createRes.body.event.id
    // Creator (the admin) auto-joins on creation.
    assert.ok(createRes.body.event.participants.includes(adminUserId))

    const updateRes = await request(app)
      .patch(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Admin-edited event', maxParticipants: 10 })
    assert.equal(updateRes.status, 200)
    assert.equal(updateRes.body.event.title, 'Admin-edited event')
    assert.equal(updateRes.body.event.maxParticipants, 10)

    const detailRes = await request(app)
      .get(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(detailRes.status, 200)
    assert.equal(detailRes.body.event.id, eventId)
    assert.ok(Array.isArray(detailRes.body.participants))
    assert.ok(
      detailRes.body.participants.some((p: { id: string }) => p.id === adminUserId),
      'participants should include full user info for the admin who auto-joined',
    )

    const removeRes = await request(app)
      .delete(`/api/admin/events/${eventId}/participants/${adminUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(removeRes.status, 200)
    assert.ok(!removeRes.body.event.participants.includes(adminUserId))

    const deleteRes = await request(app)
      .delete(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(deleteRes.status, 204)

    const afterDeleteRes = await request(app)
      .get(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(afterDeleteRes.status, 404)
  })
})
