import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import * as db from '../config/db'
import { registrationsRepository } from '../repositories/registrations.repository'
import { userNotificationSettingsRepository } from '../repositories/user-notification-settings.repository'
import type { UserRow } from '../repositories/users.repository'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'

/**
 * Сповіщення адмінам про нову заявку на реєстрацію. Той самий підхід:
 * справжній Express-застосунок і справжній ланцюг middleware,
 * підмінюється лише шар доступу до даних і мережа Telegram.
 */

function stubTelegram(handler?: (chatId: string) => { ok: boolean; status?: number }) {
  const calls: string[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/getMe')) {
      return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown }
    calls.push(String(body.chat_id))
    const outcome = handler?.(String(body.chat_id)) ?? { ok: true }
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

function fakeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: '00000000-0000-0000-0000-0000000000d1',
    telegram_id: '900100999',
    username: null,
    first_name: 'Applicant',
    last_name: 'Testovych',
    photo_url: null,
    nickname: null,
    instagram: null,
    bio: null,
    age: 20,
    faculty: 'ФІТ',
    registration_status: 'pending',
    registration_submitted_at: new Date().toISOString(),
    registration_reviewed_at: null,
    registration_reviewed_by: null,
    registration_rejection_reason: null,
    dormitory_id: null,
    banned_until: null,
    banned_permanently: false,
    created_at: new Date().toISOString(),
    notify_new_events: false,
    ...overrides,
  }
}

function submitBody() {
  return { age: 20, faculty: 'ФІТ' }
}

describe('new registration notifies opted-in admins', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('DMs an admin who turned the toggle on', async () => {
    const applicant = buildUser()
    stubAuthLayer({ users: [applicant] })
    mock.method(registrationsRepository, 'submit', async () => fakeUserRow({ id: applicant.id }))
    const getSubs = mock.method(
      userNotificationSettingsRepository,
      'getNewRegistrationSubscriberTelegramIds',
      async () => [777],
    )
    const calls = stubTelegram()

    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${tokenFor(applicant)}`)
      .send(submitBody())

    assert.equal(res.status, 200)
    assert.equal(getSubs.mock.calls[0].arguments[0], applicant.id, 'must exclude the applicant themselves')
    assert.ok(calls.includes('777'))
  })

  it('sends nobody a message when no admin has opted in (default off)', async () => {
    const applicant = buildUser()
    stubAuthLayer({ users: [applicant] })
    mock.method(registrationsRepository, 'submit', async () => fakeUserRow({ id: applicant.id }))
    mock.method(userNotificationSettingsRepository, 'getNewRegistrationSubscriberTelegramIds', async () => [])
    const calls = stubTelegram()

    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${tokenFor(applicant)}`)
      .send(submitBody())

    assert.equal(res.status, 200)
    assert.equal(calls.length, 0)
  })

  it('a Telegram failure never breaks the submission itself', async () => {
    const applicant = buildUser()
    stubAuthLayer({ users: [applicant] })
    mock.method(registrationsRepository, 'submit', async () => fakeUserRow({ id: applicant.id }))
    mock.method(
      userNotificationSettingsRepository,
      'getNewRegistrationSubscriberTelegramIds',
      async () => [777],
    )
    stubTelegram(() => ({ ok: false, status: 403 }))

    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${tokenFor(applicant)}`)
      .send(submitBody())

    assert.equal(res.status, 200)
  })

  it('a failure fetching the subscriber list itself never breaks the submission', async () => {
    const applicant = buildUser()
    stubAuthLayer({ users: [applicant] })
    mock.method(registrationsRepository, 'submit', async () => fakeUserRow({ id: applicant.id }))
    mock.method(userNotificationSettingsRepository, 'getNewRegistrationSubscriberTelegramIds', async () => {
      throw new Error('db blip')
    })

    const res = await request(app)
      .post('/api/me/registration')
      .set('Authorization', `Bearer ${tokenFor(applicant)}`)
      .send(submitBody())

    assert.equal(res.status, 200)
  })
})

describe('new-registration recipient predicate', () => {
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

  it('only ever selects admins, and excludes the applicant', async () => {
    const query = stubQuery([])
    await userNotificationSettingsRepository.getNewRegistrationSubscriberTelegramIds('applicant-1')

    const sql = String(query.mock.calls[0].arguments[0]).replace(/\s+/g, ' ')
    assert.match(sql, /join admin_users a on a\.user_id = s\.user_id/)
    assert.match(sql, /notify_new_registrations = true/)
    assert.match(sql, /s\.user_id <> \$1/)
    assert.deepEqual(query.mock.calls[0].arguments[1], ['applicant-1'])
  })
})

describe('GET/PATCH /api/me/notifications includes newRegistrationsEnabled', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('defaults to false for a user who never touched it', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    mock.method(userNotificationSettingsRepository, 'find', async () => null)

    const res = await request(app)
      .get('/api/me/notifications')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.newRegistrationsEnabled, false)
  })

  it('PATCH turns it on and the response reflects it', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const upsert = mock.method(userNotificationSettingsRepository, 'upsert', async () => ({
      user_id: user.id,
      join_confirmation_enabled: true,
      organizer_join_enabled: true,
      notify_new_registrations: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    mock.method(userNotificationSettingsRepository, 'find', async () => ({
      user_id: user.id,
      join_confirmation_enabled: true,
      organizer_join_enabled: true,
      notify_new_registrations: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const res = await request(app)
      .patch('/api/me/notifications')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ newRegistrationsEnabled: true })

    assert.equal(res.status, 200)
    assert.equal(res.body.newRegistrationsEnabled, true)
    assert.deepEqual(upsert.mock.calls[0].arguments[1], {
      joinConfirmationEnabled: undefined,
      organizerJoinEnabled: undefined,
      notifyNewRegistrations: true,
    })
  })
})
