import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import * as db from '../config/db'
import { env } from '../config/env'
import { pollsRepository, type PollOptionCountRow, type PollRow } from '../repositories/polls.repository'
import { pollBroadcastsRepository } from '../repositories/poll-broadcasts.repository'
import { usersRepository } from '../repositories/users.repository'
import {
  notificationLogRepository,
  type NewNotificationLogEntry,
} from '../repositories/notification-log.repository'
import { sendPollBroadcastMessage } from '../services/telegram-notifications.service'
import { mapWithConcurrency } from '../utils/concurrency'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * Опитування «Що організувати наступним?» — голосування, адмінське
 * керування й масова розсилка. Той самий підхід, що й у quickPlans.test.ts:
 * ходимо через справжній Express-застосунок і справжній ланцюг
 * middleware, підміняється лише шар доступу до даних і мережа Telegram.
 */

const POLL_ID = '00000000-0000-0000-0000-0000000000a1'
const OPTION_A = '00000000-0000-0000-0000-0000000000b1'
const OPTION_B = '00000000-0000-0000-0000-0000000000b2'

function fakePollRow(overrides: Partial<PollRow> = {}): PollRow {
  return {
    id: POLL_ID,
    question: 'Що організувати наступним?',
    status: 'active',
    ends_at: null,
    created_by: '00000000-0000-0000-0000-000000000001',
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    finished_at: null,
    ...overrides,
  }
}

function fakeOptions(votes: [number, number] = [0, 0]): PollOptionCountRow[] {
  return [
    { id: OPTION_A, text: 'Мафія', position: 0, votes: votes[0] },
    { id: OPTION_B, text: 'Футбол', position: 1, votes: votes[1] },
  ]
}

/** Заглушки, спільні для будь-якого читання опитування (findById +
 * результати + мій голос) — без них toResponse у сервісі впав би на
 * справжній Postgres. */
function stubPollReads(poll: PollRow, options = fakeOptions(), myVote: string | null = null) {
  mock.method(pollsRepository, 'findById', async () => poll)
  mock.method(pollsRepository, 'getOptionsWithCounts', async () => options)
  mock.method(
    pollsRepository,
    'getTotalVoters',
    async () => options.reduce((sum, option) => sum + option.votes, 0),
  )
  mock.method(pollsRepository, 'getMyVote', async () => myVote)
  mock.method(pollBroadcastsRepository, 'findLastCompleted', async () => null)
}

function validCreateBody() {
  return {
    question: 'Що організувати наступним?',
    options: ['Мафія', 'Футбол', 'Кіновечір'],
  }
}

describe('creating a poll (admin only)', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('creates a valid poll as a draft', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const create = mock.method(pollsRepository, 'create', async () => POLL_ID)
    stubPollReads(fakePollRow({ status: 'draft', published_at: null }))

    const res = await request(app)
      .post('/api/admin/polls')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send(validCreateBody())

    assert.equal(res.status, 201)
    assert.equal(res.body.poll.status, 'draft')
    assert.equal(create.mock.callCount(), 1)
    const [question, options, endsAt, createdBy] = create.mock.calls[0].arguments
    assert.equal(question, 'Що організувати наступним?')
    assert.deepEqual(options, ['Мафія', 'Футбол', 'Кіновечір'])
    assert.equal(endsAt, null)
    assert.equal(createdBy, admin.id, 'createdBy must come from the admin session, not the body')
  })

  it('rejects fewer than 2 options', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const create = mock.method(pollsRepository, 'create', async () => POLL_ID)

    const res = await request(app)
      .post('/api/admin/polls')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ question: 'Питання', options: ['Один варіант'] })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(create.mock.callCount(), 0)
  })

  it('rejects more than 8 options', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const create = mock.method(pollsRepository, 'create', async () => POLL_ID)

    const res = await request(app)
      .post('/api/admin/polls')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ question: 'Питання', options: Array.from({ length: 9 }, (_, i) => `Варіант ${i}`) })

    assert.equal(res.status, 400)
    assert.equal(create.mock.callCount(), 0)
  })

  it('rejects duplicate options', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const create = mock.method(pollsRepository, 'create', async () => POLL_ID)

    const res = await request(app)
      .post('/api/admin/polls')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ question: 'Питання', options: ['Мафія', 'мафія'] })

    assert.equal(res.status, 400)
    assert.equal(create.mock.callCount(), 0)
  })

  it('refuses a non-admin', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const create = mock.method(pollsRepository, 'create', async () => POLL_ID)

    const res = await request(app)
      .post('/api/admin/polls')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(validCreateBody())

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')
    assert.equal(create.mock.callCount(), 0)
  })
})

describe('publishing a poll', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('publishes a draft poll', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const publish = mock.method(pollsRepository, 'publish', async () => fakePollRow())
    stubPollReads(fakePollRow())

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/publish`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.poll.status, 'active')
    assert.equal(publish.mock.callCount(), 1)
  })

  it('only one poll can be active at a time', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    mock.method(pollsRepository, 'publish', async () => {
      const error = new Error('duplicate key value violates unique constraint "idx_polls_single_active"')
      ;(error as unknown as { code: string }).code = '23505'
      throw error
    })

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/publish`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'POLL_ALREADY_ACTIVE')
  })
})

describe('voting', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('lets an approved user vote', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const vote = mock.method(pollsRepository, 'vote', async () => true)
    stubPollReads(fakePollRow(), fakeOptions([1, 0]), OPTION_A)

    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: OPTION_A })

    assert.equal(res.status, 200)
    assert.equal(res.body.poll.myOptionId, OPTION_A)
    assert.equal(vote.mock.callCount(), 1)
    assert.deepEqual(vote.mock.calls[0].arguments, [POLL_ID, OPTION_A, user.id])
  })

  it('does not trust a userId supplied in the request body', async () => {
    const user = buildUser()
    const stranger = buildUser()
    stubAuthLayer({ users: [user, stranger] })
    const vote = mock.method(pollsRepository, 'vote', async () => true)
    stubPollReads(fakePollRow(), fakeOptions(), OPTION_A)

    await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: OPTION_A, userId: stranger.id })

    assert.equal(vote.mock.calls[0].arguments[2], user.id, 'userId must come from the session')
  })

  it('lets a user change their vote before the poll finishes', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const vote = mock.method(pollsRepository, 'vote', async () => true)
    stubPollReads(fakePollRow(), fakeOptions([0, 1]), OPTION_B)

    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: OPTION_B })

    assert.equal(res.status, 200)
    assert.equal(res.body.poll.myOptionId, OPTION_B)
    assert.equal(vote.mock.callCount(), 1)
  })

  it('makes a repeated same-option vote idempotent in SQL (atomic upsert)', async () => {
    const query = mock.method(db.pool, 'query', async () => ({
      rows: [],
      rowCount: 0,
      command: 'INSERT',
      oid: 0,
      fields: [],
    }))

    await pollsRepository.vote(POLL_ID, OPTION_A, '00000000-0000-0000-0000-000000000002')

    const sql = String(query.mock.calls[0].arguments[0]).replace(/\s+/g, ' ')
    assert.match(sql, /on conflict \(poll_id, user_id\) do update/)
    assert.match(sql, /set option_id = excluded\.option_id, updated_at = now\(\)/)
  })

  it('rejects a vote on a finished poll', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    mock.method(pollsRepository, 'vote', async () => false)
    stubPollReads(fakePollRow({ status: 'finished', finished_at: new Date().toISOString() }))

    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: OPTION_A })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'POLL_NOT_ACTIVE')
  })

  it('rejects an option that does not belong to the poll', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    mock.method(pollsRepository, 'vote', async () => false)
    stubPollReads(fakePollRow())

    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: '00000000-0000-0000-0000-0000000000ff' })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'INVALID_POLL_OPTION')
  })

  it('rejects an unauthenticated vote', async () => {
    const res = await request(app).post(`/api/polls/${POLL_ID}/vote`).send({ optionId: OPTION_A })
    assert.equal(res.status, 401)
    assert.equal((res.body as ApiErrorBody).error.code, 'UNAUTHORIZED')
  })

  for (const status of ['not_submitted', 'pending', 'rejected'] as const) {
    it(`blocks an unapproved user ('${status}') from voting`, async () => {
      const user = buildUser({ registrationStatus: status })
      stubAuthLayer({ users: [user] })
      const vote = mock.method(pollsRepository, 'vote', async () => true)

      const res = await request(app)
        .post(`/api/polls/${POLL_ID}/vote`)
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send({ optionId: OPTION_A })

      assert.equal(res.status, 403)
      assert.equal((res.body as ApiErrorBody).error.code, 'REGISTRATION_REQUIRED')
      assert.equal(vote.mock.callCount(), 0)
    })
  }

  it('blocks a banned user from voting', async () => {
    const user = buildUser({ bannedPermanently: true })
    stubAuthLayer({ users: [user] })
    const vote = mock.method(pollsRepository, 'vote', async () => true)

    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: OPTION_A })

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'USER_BANNED')
    assert.equal(vote.mock.callCount(), 0)
  })

  it('computes correct percentages for the results', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    mock.method(pollsRepository, 'vote', async () => true)
    // 3 votes for A, 1 for B → 75% / 25%.
    stubPollReads(fakePollRow(), fakeOptions([3, 1]), OPTION_A)

    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/vote`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ optionId: OPTION_A })

    assert.equal(res.status, 200)
    assert.equal(res.body.poll.totalVotes, 4)
    assert.deepEqual(
      res.body.poll.options.map((option: { percentage: number }) => option.percentage),
      [75, 25],
    )
  })
})

describe('admin polls routes refuse a non-admin', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  type Method = 'get' | 'post' | 'put' | 'delete'
  const routes: Array<[Method, string]> = [
    ['get', '/api/admin/polls'],
    ['put', `/api/admin/polls/${POLL_ID}`],
    ['post', `/api/admin/polls/${POLL_ID}/publish`],
    ['post', `/api/admin/polls/${POLL_ID}/finish`],
    ['delete', `/api/admin/polls/${POLL_ID}`],
    ['get', `/api/admin/polls/${POLL_ID}/audience-count?audience=all`],
    ['post', `/api/admin/polls/${POLL_ID}/broadcast`],
  ]

  function sendRequest(method: Method, path: string) {
    switch (method) {
      case 'get':
        return request(app).get(path)
      case 'post':
        return request(app).post(path)
      case 'put':
        return request(app).put(path)
      case 'delete':
        return request(app).delete(path)
    }
  }

  for (const [method, path] of routes) {
    it(`${method.toUpperCase()} ${path} → 403`, async () => {
      const user = buildUser()
      stubAuthLayer({ users: [user] })

      const res = await sendRequest(method, path).set('Authorization', `Bearer ${tokenFor(user)}`)

      assert.equal(res.status, 403)
      assert.equal((res.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')
    })
  }
})

describe('broadcast audience predicates', () => {
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

  it("'all' includes every approved, unbanned user without a notify_new_events filter", async () => {
    const query = stubQuery([])
    await usersRepository.getBroadcastAudienceTelegramIds('all')

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /registration_status = 'approved'/)
    assert.match(sql, /banned_permanently = false/)
    assert.match(sql, /banned_until is null or banned_until <= now\(\)/)
    assert.doesNotMatch(sql, /notify_new_events/)
  })

  it("'subscribers' additionally requires notify_new_events = true", async () => {
    const query = stubQuery([])
    await usersRepository.getBroadcastAudienceTelegramIds('subscribers')

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /notify_new_events = true/)
    assert.match(sql, /registration_status = 'approved'/)
    assert.match(sql, /banned_permanently = false/)
  })

  it('countBroadcastAudience applies the same predicate as the id list', async () => {
    const query = stubQuery([{ count: '0' }])
    await usersRepository.countBroadcastAudience('subscribers')

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /notify_new_events = true/)
    assert.match(sql, /registration_status = 'approved'/)
    assert.match(sql, /banned_permanently = false/)
  })
})

describe('sending the broadcast', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  function stubBroadcastPoll() {
    stubPollReads(fakePollRow())
  }

  it('rejects broadcasting a poll that is not active (draft/finished)', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubPollReads(fakePollRow({ status: 'draft' }))
    const start = mock.method(pollBroadcastsRepository, 'start', async () => 'broadcast-1')

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/broadcast`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ audience: 'all', confirm: true })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'POLL_NOT_ACTIVE')
    assert.equal(start.mock.callCount(), 0)
  })

  it('requires confirm:true before sending anything', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubBroadcastPoll()
    const start = mock.method(pollBroadcastsRepository, 'start', async () => 'broadcast-1')

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/broadcast`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ audience: 'all' })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(start.mock.callCount(), 0)
  })

  it('requires an explicit resend confirmation for a poll already broadcast before', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    mock.method(pollsRepository, 'findById', async () => fakePollRow())
    mock.method(pollBroadcastsRepository, 'findLastCompleted', async () => ({
      id: 'broadcast-0',
      poll_id: POLL_ID,
      audience: 'subscribers' as const,
      targeted: 10,
      sent: 10,
      failed: 0,
      skipped: 0,
      started_by: admin.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }))
    const start = mock.method(pollBroadcastsRepository, 'start', async () => 'broadcast-1')

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/broadcast`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ audience: 'all', confirm: true })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'POLL_ALREADY_BROADCAST')
    assert.equal(start.mock.callCount(), 0, 'must not start a run without resend confirmation')
  })

  it("one recipient's Telegram failure does not stop the rest, and the report totals match", async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubBroadcastPoll()
    mock.method(usersRepository, 'getBroadcastAudienceTelegramIds', async () => [111, 222, 333])
    mock.method(pollBroadcastsRepository, 'findAlreadySentChatIds', async () => new Set<string>())
    mock.method(pollBroadcastsRepository, 'start', async () => 'broadcast-1')
    const complete = mock.method(pollBroadcastsRepository, 'complete', async () => undefined)
    mock.method(notificationLogRepository, 'log', async () => undefined)

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown }
      if (body.chat_id === '222') {
        return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/broadcast`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ audience: 'all', confirm: true })

    assert.equal(res.status, 200)
    assert.equal(res.body.targeted, 3)
    assert.equal(res.body.sent, 2)
    assert.equal(res.body.failed, 1)
    assert.equal(res.body.skipped, 0)
    assert.equal(complete.mock.callCount(), 1)
    assert.deepEqual(complete.mock.calls[0].arguments.slice(1), [2, 1, 0])
  })

  it('never sends the same poll twice to a recipient who already got it', async () => {
    const admin = buildUser()
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    stubBroadcastPoll()
    mock.method(usersRepository, 'getBroadcastAudienceTelegramIds', async () => [111, 222])
    mock.method(pollBroadcastsRepository, 'findAlreadySentChatIds', async () => new Set(['222']))
    mock.method(pollBroadcastsRepository, 'start', async () => 'broadcast-1')
    const complete = mock.method(pollBroadcastsRepository, 'complete', async () => undefined)
    mock.method(notificationLogRepository, 'log', async () => undefined)

    const sentTo: string[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown }
      sentTo.push(String(body.chat_id))
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const res = await request(app)
      .post(`/api/admin/polls/${POLL_ID}/broadcast`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ audience: 'all', confirm: true })

    assert.equal(res.status, 200)
    assert.equal(res.body.targeted, 2)
    assert.equal(res.body.sent, 1)
    assert.equal(res.body.skipped, 1)
    assert.ok(!sentTo.includes('222'), 'must never message a recipient who already got this poll')
    assert.deepEqual(complete.mock.calls[0].arguments.slice(1), [1, 0, 1])
  })

  it('uses bounded concurrency for the fan-out, not one request per recipient at once', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(items, 5, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
    })
    assert.ok(peak <= 5, `peak concurrency was ${peak}`)
  })
})

describe('poll_broadcast notification log entries', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('logs a successful send with kind poll_broadcast, the poll id and question', async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch
    const log = mock.method(notificationLogRepository, 'log', async () => undefined)

    await sendPollBroadcastMessage('555000123', {
      id: POLL_ID,
      question: 'Що організувати наступним?',
      options: ['Мафія', 'Футбол'],
    })

    assert.equal(log.mock.callCount(), 1)
    const entry = log.mock.calls[0].arguments[0] as NewNotificationLogEntry
    assert.equal(entry.kind, 'poll_broadcast')
    assert.equal(entry.pollId, POLL_ID)
    assert.equal(entry.pollQuestion, 'Що організувати наступним?')
    assert.equal(entry.success, true)
  })

  it('logs a failed send without ever including BOT_TOKEN in the error message', async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    const log = mock.method(notificationLogRepository, 'log', async () => undefined)

    await assert.rejects(() =>
      sendPollBroadcastMessage('555000124', {
        id: POLL_ID,
        question: 'Питання',
        options: ['A', 'B'],
      }),
    )

    const entry = log.mock.calls[0].arguments[0] as NewNotificationLogEntry
    assert.equal(entry.kind, 'poll_broadcast')
    assert.equal(entry.success, false)
    assert.ok(env.BOT_TOKEN.length > 0, 'sanity check: a token is actually configured in this test env')
    assert.ok(
      !String(entry.errorMessage).includes(env.BOT_TOKEN),
      'the logged error must never contain BOT_TOKEN',
    )
  })
})

describe('poll deep link', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('sends an inline "Проголосувати в DormHub" button linking to poll_<id>', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body })
      if (String(url).endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await sendPollBroadcastMessage('555000125', {
      id: POLL_ID,
      question: 'Питання',
      options: ['A', 'B'],
    })

    const sendCall = calls.find((call) => call.url.endsWith('/sendMessage'))
    assert.ok(sendCall, 'sendMessage must be called')
    const markup = sendCall.body.reply_markup as { inline_keyboard: { text: string; url: string }[][] }
    assert.equal(markup.inline_keyboard[0][0].text, 'Проголосувати в DormHub')
    assert.match(markup.inline_keyboard[0][0].url, new RegExp(`startapp=poll_${POLL_ID}$`))
  })
})
