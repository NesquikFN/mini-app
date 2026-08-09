/**
 * Integration tests for moderated user registration — against the real
 * Express app + live Postgres (see auth.integration.test.ts for the same
 * pattern). Run via `npm run test:integration --workspace=backend`.
 *
 * Uses telegram_id range 900_000_401-410, distinct from every other
 * integration suite (see dormitory/admin/event-participant-preview files
 * for their own reserved ranges).
 *
 * REQUIRES database/migrations/0019_registration_moderation.sql to
 * already be applied — this file has no way to run DDL itself.
 *
 * BOT_TOKEN in the test process is a fake placeholder (see package.json's
 * test:integration script), so every Telegram send in this suite fails
 * with a real network/API error — that's intentional, not a bug: it's
 * exactly what proves "a failed Telegram send doesn't roll back the
 * approval" without needing to mock anything.
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

function initDataFor(telegramId: number, name: string): string {
  return buildValidInitData(
    {
      auth_date: String(nowSeconds()),
      user: telegramUserField(telegramId, name, `registration_test_${telegramId}`),
      query_id: 'AAH_registration_test',
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

describe('registration moderation', () => {
  const APPLICANT_TELEGRAM_ID = 900_000_401
  const SECOND_APPLICANT_TELEGRAM_ID = 900_000_402
  const NEW_USER_TELEGRAM_ID = 900_000_403
  const ADMIN_TELEGRAM_ID = 900_000_404

  let applicantToken: string
  let applicantUserId: string
  let secondApplicantToken: string
  let secondApplicantUserId: string
  let adminToken: string
  let adminUserId: string

  before(async () => {
    const applicant = await authenticate(APPLICANT_TELEGRAM_ID, 'Заявник Один')
    applicantToken = applicant.token
    applicantUserId = applicant.userId

    const secondApplicant = await authenticate(SECOND_APPLICANT_TELEGRAM_ID, 'Заявник Два')
    secondApplicantToken = secondApplicant.token
    secondApplicantUserId = secondApplicant.userId

    const admin = await authenticate(ADMIN_TELEGRAM_ID, 'Модератор')
    adminToken = admin.token
    adminUserId = admin.userId
    await query(
      'insert into admin_users (user_id) values ($1) on conflict (user_id) do nothing',
      [adminUserId],
    )
  })

  after(async () => {
    await query('delete from admin_users where user_id = $1', [adminUserId])
    await query('delete from users where telegram_id = any($1)', [
      [
        APPLICANT_TELEGRAM_ID,
        SECOND_APPLICANT_TELEGRAM_ID,
        NEW_USER_TELEGRAM_ID,
        ADMIN_TELEGRAM_ID,
      ],
    ])
  })

  it('a brand-new user defaults to not_submitted (migration default going forward)', async () => {
    const { token } = await authenticate(NEW_USER_TELEGRAM_ID, 'Новенький')
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.user.registrationStatus, 'not_submitted')
  })

  it('POST /api/me/registration rejects age under 13', async () => {
    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ age: 10, faculty: 'Факультет інформатики' })
    assert.equal(res.status, 400)
  })

  it('POST /api/me/registration requires faculty', async () => {
    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ age: 19 })
    assert.equal(res.status, 400)
  })

  it('POST /api/me/registration ignores a client-supplied registrationStatus and sets pending', async () => {
    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        age: 19,
        faculty: 'Факультет інформатики',
        instagram: '@dorm.hub',
        bio: 'Люблю настільні ігри',
        registrationStatus: 'approved',
      })

    assert.equal(res.status, 200)
    assert.equal(res.body.user.registrationStatus, 'pending')
    assert.equal(res.body.user.age, 19)
    assert.equal(res.body.user.faculty, 'Факультет інформатики')
    assert.equal(res.body.user.instagram, 'dorm.hub')
  })

  it('submits the second applicant too, for the reject test below', async () => {
    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${secondApplicantToken}`)
      .send({ age: 20, faculty: 'Факультет права' })
    assert.equal(res.status, 200)
    assert.equal(res.body.user.registrationStatus, 'pending')
  })

  it('rejects a non-admin from every /api/admin/registrations endpoint', async () => {
    const listRes = await request(app)
      .get('/api/admin/registrations')
      .set('Authorization', `Bearer ${applicantToken}`)
    assert.equal(listRes.status, 403)

    const approveRes = await request(app)
      .post(`/api/admin/registrations/${applicantUserId}/approve`)
      .set('Authorization', `Bearer ${applicantToken}`)
    assert.equal(approveRes.status, 403)
  })

  it('GET /api/admin/registrations?status=pending lists both pending applicants, oldest first', async () => {
    const res = await request(app)
      .get('/api/admin/registrations?status=pending&limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 200)

    const ids = res.body.registrations.map((r: { id: string }) => r.id)
    assert.ok(ids.includes(applicantUserId))
    assert.ok(ids.includes(secondApplicantUserId))

    const firstIndex = ids.indexOf(applicantUserId)
    const secondIndex = ids.indexOf(secondApplicantUserId)
    assert.ok(firstIndex < secondIndex, 'earlier submission should sort before the later one')
  })

  it('GET /api/admin/registrations/:userId returns full detail', async () => {
    const res = await request(app)
      .get(`/api/admin/registrations/${applicantUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.registration.id, applicantUserId)
    assert.equal(res.body.registration.faculty, 'Факультет інформатики')
    assert.equal(res.body.registration.instagram, 'dorm.hub')
  })

  it('an admin cannot approve or reject their own registration', async () => {
    const approveRes = await request(app)
      .post(`/api/admin/registrations/${adminUserId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(approveRes.status, 409)
    assert.equal(approveRes.body.error.code, 'CANNOT_MODERATE_OWN_REGISTRATION')

    const rejectRes = await request(app)
      .post(`/api/admin/registrations/${adminUserId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(rejectRes.status, 409)
    assert.equal(rejectRes.body.error.code, 'CANNOT_MODERATE_OWN_REGISTRATION')
  })

  it('POST .../approve atomically approves a pending registration and survives a failed Telegram send', async () => {
    // BOT_TOKEN is a fake placeholder in this test process (see file
    // header) — the DM to the applicant WILL fail. If the approval below
    // still lands as 'approved' in the response, that IS the proof the
    // failure doesn't roll anything back — no mock needed.
    const res = await request(app)
      .post(`/api/admin/registrations/${applicantUserId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.registration.registrationStatus, 'approved')

    const meRes = await request(app).get('/api/me').set('Authorization', `Bearer ${applicantToken}`)
    assert.equal(meRes.body.user.registrationStatus, 'approved')
  })

  it('a second approve on the same (now-approved) registration returns 409, not a silent re-apply', async () => {
    const res = await request(app)
      .post(`/api/admin/registrations/${applicantUserId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 409)
    assert.equal(res.body.error.code, 'REGISTRATION_NOT_PENDING')
  })

  it('POST .../reject sets rejected + reason on a pending registration', async () => {
    const res = await request(app)
      .post(`/api/admin/registrations/${secondApplicantUserId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Вкажіть реальний факультет' })

    assert.equal(res.status, 200)
    assert.equal(res.body.registration.registrationStatus, 'rejected')
    assert.equal(res.body.registration.registrationRejectionReason, 'Вкажіть реальний факультет')

    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${secondApplicantToken}`)
    assert.equal(meRes.body.user.registrationStatus, 'rejected')
    assert.equal(meRes.body.user.registrationRejectionReason, 'Вкажіть реальний факультет')
  })

  it('a second reject on the same (now-rejected) registration returns 409', async () => {
    const res = await request(app)
      .post(`/api/admin/registrations/${secondApplicantUserId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
    assert.equal(res.status, 409)
    assert.equal(res.body.error.code, 'REGISTRATION_NOT_PENDING')
  })

  it('a rejected applicant can re-submit, clearing the old rejection reason and going back to pending', async () => {
    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${secondApplicantToken}`)
      .send({ age: 21, faculty: 'Факультет права (виправлено)' })

    assert.equal(res.status, 200)
    assert.equal(res.body.user.registrationStatus, 'pending')
    assert.equal(res.body.user.registrationRejectionReason, undefined)
  })
})
