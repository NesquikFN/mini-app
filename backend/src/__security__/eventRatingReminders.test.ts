import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import * as db from '../config/db'
import { eventRatingsRepository } from '../repositories/event-ratings.repository'
import { notificationLogRepository } from '../repositories/notification-log.repository'
import { sendDueRatingRequests } from '../services/event-rating-reminders.service'

/**
 * Нагадування «Як пройшла подія?» 30–60 хв після завершення. Той самий
 * підхід, що й для broadcast-тестів опитувань у polls.test.ts: реальна
 * логіка сервісу й repository, підмінюється лише pool.query (для
 * SQL-предикатів) та мережа Telegram.
 */

const EVENT_ID = '00000000-0000-0000-0000-0000000000ee'
const ORGANIZER_ID = '00000000-0000-0000-0000-000000000aa1'

function fakeDueEvent(overrides: Partial<{
  id: string
  title: string
  creator_id: string
  date: string
  time: string
  is_vip_only: boolean
  is_gpu_only: boolean
}> = {}) {
  return {
    id: EVENT_ID,
    title: 'Настолки',
    creator_id: ORGANIZER_ID,
    date: '2026-01-01',
    time: '18:00:00',
    is_vip_only: false,
    is_gpu_only: false,
    ...overrides,
  }
}

function stubTelegramGetMeAnd(handler: (chatId: string) => { ok: boolean; status?: number }) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/getMe')) {
      return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown }
    const outcome = handler(String(body.chat_id))
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
}

describe('sendDueRatingRequests', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('sends the request once per eligible recipient and marks the event as handled', async () => {
    mock.method(eventRatingsRepository, 'findDueForRatingRequest', async () => [fakeDueEvent()])
    mock.method(eventRatingsRepository, 'getRatingRequestTelegramIds', async () => [111, 222])
    const markSent = mock.method(eventRatingsRepository, 'markRatingReminderSent', async () => undefined)
    mock.method(notificationLogRepository, 'log', async () => undefined)
    stubTelegramGetMeAnd(() => ({ ok: true }))

    await sendDueRatingRequests()

    assert.equal(markSent.mock.callCount(), 1)
    assert.equal(markSent.mock.calls[0].arguments[0], EVENT_ID)
  })

  it("one recipient's Telegram failure does not stop delivery to the rest", async () => {
    mock.method(eventRatingsRepository, 'findDueForRatingRequest', async () => [fakeDueEvent()])
    mock.method(eventRatingsRepository, 'getRatingRequestTelegramIds', async () => [111, 222, 333])
    const markSent = mock.method(eventRatingsRepository, 'markRatingReminderSent', async () => undefined)
    mock.method(notificationLogRepository, 'log', async () => undefined)
    const delivered: string[] = []
    stubTelegramGetMeAnd((chatId) => {
      if (chatId === '222') return { ok: false, status: 403 }
      delivered.push(chatId)
      return { ok: true }
    })

    await sendDueRatingRequests()

    assert.deepEqual(delivered.sort(), ['111', '333'])
    // Partial delivery still marks the event as handled — the failure was
    // final (403 blocked), not transient, so retrying would not help.
    assert.equal(markSent.mock.callCount(), 1)
  })

  it('does not mark the event handled if every recipient failed transiently', async () => {
    mock.method(eventRatingsRepository, 'findDueForRatingRequest', async () => [fakeDueEvent()])
    mock.method(eventRatingsRepository, 'getRatingRequestTelegramIds', async () => [111])
    const markSent = mock.method(eventRatingsRepository, 'markRatingReminderSent', async () => undefined)
    mock.method(notificationLogRepository, 'log', async () => undefined)
    stubTelegramGetMeAnd(() => ({ ok: false, status: 500 }))

    await sendDueRatingRequests()

    assert.equal(markSent.mock.callCount(), 0, 'a fully transient failure must be retried on the next poll')
  })

  it('is a no-op when nothing is due', async () => {
    mock.method(eventRatingsRepository, 'findDueForRatingRequest', async () => [])
    const getRecipients = mock.method(eventRatingsRepository, 'getRatingRequestTelegramIds', async () => [])
    const markSent = mock.method(eventRatingsRepository, 'markRatingReminderSent', async () => undefined)

    await sendDueRatingRequests()

    assert.equal(getRecipients.mock.callCount(), 0)
    assert.equal(markSent.mock.callCount(), 0)
  })
})

describe('rating-request recipient predicate', () => {
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

  it('excludes the organizer, already-rated participants, banned and unapproved users', async () => {
    const query = stubQuery([])
    await eventRatingsRepository.getRatingRequestTelegramIds(EVENT_ID, ORGANIZER_ID)

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /ep\.user_id <> \$2/, 'must exclude the organizer')
    assert.match(sql, /not exists \(\s*select 1 from event_ratings/, 'must exclude anyone who already rated')
    assert.match(sql, /registration_status = 'approved'/)
    assert.match(sql, /banned_permanently = false/)
    assert.match(sql, /banned_until is null or u\.banned_until <= now\(\)/)
  })

  it('joins the VIP/GPU role table when the event requires it', async () => {
    const query = stubQuery([])
    await eventRatingsRepository.getRatingRequestTelegramIds(EVENT_ID, ORGANIZER_ID, 'vip')
    assert.match(sqlOf(query.mock.calls[0]), /join vip_users v on v\.user_id = u\.id/)
  })

  it('never sends a reminder for an event that has not yet received one', async () => {
    const query = stubQuery([])
    await eventRatingsRepository.findDueForRatingRequest('2026-01-01T00:00:00', '2026-01-01T01:00:00')
    assert.match(sqlOf(query.mock.calls[0]), /rating_reminder_sent_at is null/)
  })
})
