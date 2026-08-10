import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import { eventsRepository } from '../repositories/events.repository'
import { registrationsRepository } from '../repositories/registrations.repository'
import { buildUser, stubAuthLayer, tokenFor, userWithStatus } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * VULN-001: до цього виправлення статус заявки перевіряв лише
 * RegistrationGate у frontend, тож будь-хто з валідною Telegram-підписою
 * міг звертатись до захищеного API напряму.
 *
 * Тести ходять через справжній app і справжній ланцюг
 * requireTelegramAuth → requireApprovedUser; підміняється лише доступ до
 * даних.
 */
describe('registration gate on protected API', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('rejects an unauthenticated request with 401, not 403', async () => {
    const res = await request(app).get('/api/events')
    assert.equal(res.status, 401)
    assert.equal((res.body as ApiErrorBody).error.code, 'UNAUTHORIZED')
  })

  for (const status of ['not_submitted', 'pending', 'rejected'] as const) {
    it(`blocks '${status}' from listing events with 403 REGISTRATION_REQUIRED`, async () => {
      const user = userWithStatus(status)
      stubAuthLayer({ users: [user] })

      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${tokenFor(user)}`)

      assert.equal(res.status, 403)
      assert.equal((res.body as ApiErrorBody).error.code, 'REGISTRATION_REQUIRED')
    })
  }

  it("blocks an unapproved user from another user's public profile", async () => {
    const user = userWithStatus('pending')
    const other = buildUser()
    stubAuthLayer({ users: [user, other] })

    const res = await request(app)
      .get(`/api/users/${other.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'REGISTRATION_REQUIRED')
  })

  it('blocks an unapproved user from event templates and app settings', async () => {
    const user = userWithStatus('rejected')
    stubAuthLayer({ users: [user] })
    const token = `Bearer ${tokenFor(user)}`

    for (const path of ['/api/event-templates', '/api/app-settings', '/api/me/events']) {
      const res = await request(app).get(path).set('Authorization', token)
      assert.equal(res.status, 403, `${path} should be gated`)
      assert.equal((res.body as ApiErrorBody).error.code, 'REGISTRATION_REQUIRED')
    }
  })

  it('lets an approved user through to the events list', async () => {
    const user = buildUser({ registrationStatus: 'approved' })
    stubAuthLayer({ users: [user] })
    mock.method(eventsRepository, 'findAll', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { events: [] })
  })

  it('lets an admin through even when their own registration status is stale', async () => {
    const admin = userWithStatus('not_submitted')
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    mock.method(eventsRepository, 'findAll', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
  })

  it('keeps the admin API reachable for an admin with a stale status', async () => {
    const admin = userWithStatus('pending')
    stubAuthLayer({ users: [admin], admins: [admin.id] })

    const res = await request(app)
      .get('/api/admin/check')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { isAdmin: true })
  })

  it('still refuses the admin API for a non-admin approved user', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .get('/api/admin/check')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')
  })
})

describe('routes that must stay open before approval', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('allows GET /api/me so RegistrationGate can read its own status', async () => {
    const user = userWithStatus('not_submitted')
    stubAuthLayer({ users: [user] })

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.user.registrationStatus, 'not_submitted')
  })

  it('allows submitting a registration before approval', async () => {
    const user = userWithStatus('not_submitted')
    stubAuthLayer({ users: [user] })
    mock.method(registrationsRepository, 'submit', async () => ({
      id: user.id,
      telegram_id: String(user.telegramId),
      username: null,
      first_name: user.firstName,
      last_name: null,
      photo_url: null,
      nickname: null,
      instagram: null,
      bio: null,
      age: 20,
      faculty: 'Факультет інформатики',
      registration_status: 'pending' as const,
      registration_submitted_at: null,
      registration_reviewed_at: null,
      registration_reviewed_by: null,
      registration_rejection_reason: null,
      dormitory_id: null,
      banned_until: null,
      banned_permanently: false,
      created_at: new Date().toISOString(),
      notify_new_events: false,
    }))

    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ age: 20, faculty: 'Факультет інформатики' })

    assert.equal(res.status, 200)
    assert.equal(res.body.user.registrationStatus, 'pending')
  })
})

describe('ban still takes precedence over the registration gate', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('returns USER_BANNED (not REGISTRATION_REQUIRED) for a banned unapproved user', async () => {
    const user = userWithStatus('pending')
    user.bannedPermanently = true
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'USER_BANNED')
  })

  it('blocks a temporarily banned user whose ban has not expired', async () => {
    const user = buildUser({
      bannedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'USER_BANNED')
  })

  it('lets a user through once a temporary ban has expired', async () => {
    const user = buildUser({
      bannedUntil: new Date(Date.now() - 60 * 1000).toISOString(),
    })
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
  })
})
