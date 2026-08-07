/**
 * Integration tests for the admin API against the real Express app + live
 * Supabase (see auth.integration.test.ts for the same rationale — this
 * project has no DB mocking layer). Run via
 * `npm run test:integration --workspace=backend`, which injects a
 * dedicated BOT_TOKEN/JWT_SECRET for the test process only (see
 * package.json) so these never depend on — or touch — the developer's
 * real bot credentials.
 *
 * Grants admin rights the same way an operator would in production (an
 * insert into admin_users — see README "Адмін-панель"), just done here
 * via the Supabase client instead of the SQL Editor, so the test is
 * self-contained. Everything this suite creates (test users, events) is
 * cleaned up in `after()`.
 *
 * REQUIRES database/migrations/0002_admin_users.sql and
 * 0004_dormitories.sql to already be applied to the Supabase project —
 * this file has no way to run DDL itself.
 */
import { describe, it, before, after } from 'node:test'
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

describe('admin API', () => {
  let regularToken: string
  let regularUserId: string
  let adminToken: string
  let adminUserId: string
  const createdEventIds: string[] = []

  before(async () => {
    const regular = await authenticate(REGULAR_TELEGRAM_ID, 'Звичайний Юзер')
    regularToken = regular.token
    regularUserId = regular.userId

    const admin = await authenticate(ADMIN_TELEGRAM_ID, 'Адмін Юзер')
    adminToken = admin.token
    adminUserId = admin.userId

    // Event creation now requires a dormitory (see dormitory.integration.test.ts)
    // — the admin user needs one before this suite's "create event" test runs.
    const dormitoriesRes = await request(app)
      .get('/api/dormitories')
      .set('Authorization', `Bearer ${adminToken}`)
    const dormitoryId: string = dormitoriesRes.body.dormitories[0].id
    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dormitoryId })

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

  after(async () => {
    for (const id of createdEventIds) {
      await supabase.from('events').delete().eq('id', id)
    }
    await supabase.from('admin_users').delete().eq('user_id', adminUserId)
    await supabase.from('users').delete().in('telegram_id', [REGULAR_TELEGRAM_ID, ADMIN_TELEGRAM_ID])
  })

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/check')
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'UNAUTHORIZED')
  })

  it('rejects an authenticated non-admin with 403 ADMIN_ACCESS_REQUIRED', async () => {
    const res = await request(app)
      .get('/api/admin/check')
      .set('Authorization', `Bearer ${regularToken}`)
    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'ADMIN_ACCESS_REQUIRED')
  })

  it('GET /api/admin/check returns 200 {isAdmin:true} for a real admin', async () => {
    const res = await request(app).get('/api/admin/check').set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { isAdmin: true })
  })

  it('GET /api/admin/stats returns real, non-hardcoded counts', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 200)
    for (const key of ['users', 'events', 'activeEvents', 'participants']) {
      assert.equal(typeof res.body[key], 'number', `${key} should be a number`)
      assert.ok(res.body[key] >= 0)
    }
  })

  it('GET /api/admin/users paginates and includes the admin with eventsCreatedCount', async () => {
    const res = await request(app)
      .get('/api/admin/users?page=1&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.users))
    assert.equal(res.body.pagination.page, 1)
    assert.equal(res.body.pagination.limit, 50)
    assert.ok(res.body.pagination.total >= 2)

    const self = res.body.users.find((u: { id: string }) => u.id === adminUserId)
    assert.ok(self, 'admin should appear in the users list')
    assert.equal(self.telegramId, ADMIN_TELEGRAM_ID)
    assert.equal(typeof self.eventsCreatedCount, 'number')
  })

  it('GET /api/admin/users?search finds by username and by telegram_id', async () => {
    const byUsername = await request(app)
      .get(`/api/admin/users?search=admin_test_${ADMIN_TELEGRAM_ID}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.ok(byUsername.body.users.some((u: { id: string }) => u.id === adminUserId))

    const byTelegramId = await request(app)
      .get(`/api/admin/users?search=${ADMIN_TELEGRAM_ID}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.ok(byTelegramId.body.users.some((u: { id: string }) => u.id === adminUserId))

    const noMatch = await request(app)
      .get('/api/admin/users?search=definitely-not-a-real-username-zzz')
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(noMatch.body.users.length, 0)
  })

  it('GET /api/admin/users/:id returns profile, stats, and event lists', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${adminUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.user.id, adminUserId)
    assert.equal(res.body.user.telegramId, ADMIN_TELEGRAM_ID)
    assert.equal(typeof res.body.stats.createdEvents, 'number')
    assert.equal(typeof res.body.stats.participatingEvents, 'number')
    assert.ok(Array.isArray(res.body.createdEvents))
    assert.ok(Array.isArray(res.body.participatingEvents))
  })

  it('GET /api/admin/users/:id returns 404 for a non-existent user', async () => {
    const res = await request(app)
      .get('/api/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 404)
    assert.equal(res.body.error.code, 'USER_NOT_FOUND')
  })

  it('full events + participant lifecycle: list, detail, participants, remove, delete', async () => {
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin API test event',
        description: 'Створено адмін-тестом, безпечно видалити.',
        date: '2026-12-28',
        time: '09:00',
        location: 'Test room',
        maxParticipants: 5,
      })
    assert.equal(createRes.status, 201)
    const eventId: string = createRes.body.event.id
    createdEventIds.push(eventId)

    const joinRes = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${regularToken}`)
    assert.equal(joinRes.status, 200)

    const listRes = await request(app)
      .get('/api/admin/events?limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(listRes.status, 200)
    const listed = listRes.body.events.find((e: { id: string }) => e.id === eventId)
    assert.ok(listed, 'created event should appear in admin events list')
    assert.equal(listed.participantsCount, 2)
    assert.equal(listed.creator.id, adminUserId)

    const detailRes = await request(app)
      .get(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(detailRes.status, 200)
    assert.equal(detailRes.body.creator.id, adminUserId)
    assert.ok(
      detailRes.body.participants.some((p: { id: string }) => p.id === regularUserId),
      'participants should be full PublicUser objects, not just ids',
    )

    const participantsRes = await request(app)
      .get(`/api/admin/events/${eventId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(participantsRes.status, 200)
    assert.ok(participantsRes.body.participants.some((p: { id: string }) => p.id === regularUserId))

    // The organizer (creator) is also a participant (auto-joined on
    // creation) but must not be removable through this endpoint.
    const removeOrganizerRes = await request(app)
      .delete(`/api/admin/events/${eventId}/participants/${adminUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(removeOrganizerRes.status, 400)
    assert.equal(removeOrganizerRes.body.error.code, 'CANNOT_REMOVE_ORGANIZER')

    const removeRes = await request(app)
      .delete(`/api/admin/events/${eventId}/participants/${regularUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(removeRes.status, 200)
    assert.deepEqual(removeRes.body, { success: true })

    const removeAgainRes = await request(app)
      .delete(`/api/admin/events/${eventId}/participants/${regularUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(removeAgainRes.status, 404)
    assert.equal(removeAgainRes.body.error.code, 'PARTICIPANT_NOT_FOUND')

    const deleteRes = await request(app)
      .delete(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(deleteRes.status, 200)
    assert.deepEqual(deleteRes.body, { success: true })

    const afterDeleteRes = await request(app)
      .get(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(afterDeleteRes.status, 404)
    assert.equal(afterDeleteRes.body.error.code, 'EVENT_NOT_FOUND')

    const deleteAgainRes = await request(app)
      .delete(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(deleteAgainRes.status, 404)
  })

  it('GET /api/admin/events supports the date=today/week/all filter', async () => {
    for (const date of ['today', 'week', 'all']) {
      const res = await request(app)
        .get(`/api/admin/events?date=${date}&limit=5`)
        .set('Authorization', `Bearer ${adminToken}`)
      assert.equal(res.status, 200, `date=${date} should succeed`)
      assert.ok(Array.isArray(res.body.events))
    }
  })

  it('rejects a non-admin from admin mutation endpoints too', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${regularToken}`)
    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'ADMIN_ACCESS_REQUIRED')
  })

  describe('admin management (admins CRUD)', () => {
    const TARGET_TELEGRAM_ID = 900_000_007
    let targetUserId: string

    before(async () => {
      const target = await authenticate(TARGET_TELEGRAM_ID, 'Майбутній Адмін')
      targetUserId = target.userId
    })

    after(async () => {
      await supabase.from('admin_users').delete().eq('user_id', targetUserId)
      await supabase.from('users').delete().eq('telegram_id', TARGET_TELEGRAM_ID)
    })

    it('rejects a non-admin from admins endpoints with 403', async () => {
      const res = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${regularToken}`)
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'ADMIN_ACCESS_REQUIRED')
    })

    it('GET /api/admin/admins lists the seeded admin with profile fields', async () => {
      const res = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
      assert.equal(res.status, 200)
      assert.ok(Array.isArray(res.body.admins))
      const self = res.body.admins.find((a: { id: string }) => a.id === adminUserId)
      assert.ok(self, 'the admin from before() should be in the list')
      assert.equal(self.telegramId, ADMIN_TELEGRAM_ID)
      assert.ok('adminSince' in self)
    })

    it('POST /api/admin/admins adds a new admin by telegramId', async () => {
      const res = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ telegramId: TARGET_TELEGRAM_ID })

      assert.equal(res.status, 201)
      assert.equal(res.body.admin.id, targetUserId)
      assert.equal(res.body.admin.telegramId, TARGET_TELEGRAM_ID)

      const listRes = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
      assert.ok(listRes.body.admins.some((a: { id: string }) => a.id === targetUserId))
    })

    it('POST /api/admin/admins is idempotent — re-adding does not duplicate', async () => {
      await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ telegramId: TARGET_TELEGRAM_ID })
      await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ telegramId: TARGET_TELEGRAM_ID })

      const listRes = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
      const matches = listRes.body.admins.filter((a: { id: string }) => a.id === targetUserId)
      assert.equal(matches.length, 1, 'target admin should appear exactly once')
    })

    it('POST /api/admin/admins returns 404 for a telegramId with no matching user', async () => {
      const res = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ telegramId: 999_999_999_999 })
      assert.equal(res.status, 404)
      assert.equal(res.body.error.code, 'USER_NOT_FOUND')
    })

    it('DELETE /api/admin/admins/:userId revokes admin rights', async () => {
      const res = await request(app)
        .delete(`/api/admin/admins/${targetUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      assert.equal(res.status, 200)
      assert.deepEqual(res.body, { success: true })

      const listRes = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
      assert.ok(!listRes.body.admins.some((a: { id: string }) => a.id === targetUserId))
    })

    it('DELETE /api/admin/admins/:userId returns 404 for someone who is not an admin', async () => {
      const res = await request(app)
        .delete(`/api/admin/admins/${targetUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      assert.equal(res.status, 404)
      assert.equal(res.body.error.code, 'ADMIN_NOT_FOUND')
    })
  })
})
