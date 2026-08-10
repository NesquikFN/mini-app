import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import * as db from '../config/db'
import { usersRepository } from '../repositories/users.repository'
import { eventsRepository } from '../repositories/events.repository'
import { handleTelegramWebhookUpdate } from '../services/telegram-notifications.service'
import { notificationLogRepository } from '../repositories/notification-log.repository'
import { mapWithConcurrency } from '../utils/concurrency'
import type { AuthUser } from '../types/user'

/**
 * VULN-003 (розсилка) і VULN-009 (отримувачі). Перевіряються справжні
 * функції репозиторіїв і справжній обробник вебхука; підміняється лише
 * шар запитів до Postgres і глобальний fetch.
 */

/**
 * Підміняється саме pool.query — тобто останній крок перед мережею.
 * Уся решта (config/db.query і код репозиторію, що будує SQL) лишається
 * справжньою, тож тест бачить рівно той запит, який пішов би в Postgres.
 */
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

describe('notification recipients exclude banned and unapproved users', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('filters announcement subscribers in SQL, not in JS', async () => {
    const query = stubQuery([])
    await usersRepository.getSubscribedTelegramIds()

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /notify_new_events = true/)
    assert.match(sql, /registration_status = 'approved'/)
    assert.match(sql, /banned_permanently = false/)
    // Прострочений тимчасовий бан має знову пропускати користувача —
    // саме тому порівняння з now(), а не просто "banned_until is null".
    assert.match(sql, /banned_until is null or banned_until <= now\(\)/)
  })

  it('keeps the dormitory filter alongside the new ban filters', async () => {
    const query = stubQuery([])
    await usersRepository.getSubscribedTelegramIds('00000000-0000-0000-0000-000000000101')

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /dormitory_id = \$1/)
    assert.match(sql, /registration_status = 'approved'/)
  })

  it('filters reminder recipients the same way', async () => {
    const query = stubQuery([])
    await eventsRepository.getParticipantTelegramIds('00000000-0000-0000-0000-0000000000ee')

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /u\.registration_status = 'approved'/)
    assert.match(sql, /u\.banned_permanently = false/)
    assert.match(sql, /u\.banned_until is null or u\.banned_until <= now\(\)/)
  })
})

describe('bot ignores commands from banned users', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  function bannedUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      id: '00000000-0000-0000-0000-0000000000b1',
      telegramId: 555_000_1,
      firstName: 'Забанений',
      registrationStatus: 'approved',
      bannedPermanently: true,
      notifyNewEvents: false,
      ...overrides,
    }
  }

  function startUpdate(telegramId: number) {
    return {
      update_id: 1,
      message: {
        chat: { id: telegramId, type: 'private' },
        text: '/start',
        from: { first_name: 'Забанений' },
      },
    }
  }

  it('sends nothing when a permanently banned user types /start', async () => {
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('bot API must not be called for a banned user')
    }) as typeof fetch
    mock.method(usersRepository, 'getUserByTelegramId', async () => bannedUser())

    await handleTelegramWebhookUpdate(startUpdate(5_550_001))

    assert.equal(fetchCalls, 0)
  })

  it('sends nothing while a temporary ban is still active', async () => {
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('bot API must not be called for a banned user')
    }) as typeof fetch
    mock.method(usersRepository, 'getUserByTelegramId', async () =>
      bannedUser({
        bannedPermanently: false,
        bannedUntil: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    )

    await handleTelegramWebhookUpdate(startUpdate(5_550_002))

    assert.equal(fetchCalls, 0)
  })

  it('does not disable notifications on behalf of a banned user', async () => {
    globalThis.fetch = (async () => {
      throw new Error('bot API must not be called for a banned user')
    }) as typeof fetch
    mock.method(usersRepository, 'getUserByTelegramId', async () => bannedUser())
    const setNotify = mock.method(usersRepository, 'setNotifyNewEvents', async () => bannedUser())

    await handleTelegramWebhookUpdate({
      update_id: 2,
      message: {
        chat: { id: 5_550_003, type: 'private' },
        text: '/notifications_off',
      },
    })

    assert.equal(setNotify.mock.callCount(), 0)
  })

  it('still greets a user whose temporary ban has expired', async () => {
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
    mock.method(usersRepository, 'getUserByTelegramId', async () =>
      bannedUser({
        bannedPermanently: false,
        bannedUntil: new Date(Date.now() - 1000).toISOString(),
      }),
    )
    mock.method(notificationLogRepository, 'log', async () => undefined)

    await handleTelegramWebhookUpdate(startUpdate(5_550_004))

    assert.ok(fetchCalls > 0, 'an unbanned user must still get the greeting')
  })
})

describe('bounded notification fan-out', () => {
  it('never runs more tasks at once than the configured concurrency', async () => {
    const items = Array.from({ length: 50 }, (_, index) => index)
    let inFlight = 0
    let peak = 0
    const seen: number[] = []

    await mapWithConcurrency(items, 5, async (item) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      seen.push(item)
      inFlight -= 1
    })

    assert.equal(peak <= 5, true, `peak concurrency was ${peak}`)
    assert.equal(seen.length, items.length, 'every recipient must still be processed')
    assert.deepEqual([...seen].sort((a, b) => a - b), items)
  })

  it('handles an empty recipient list without work', async () => {
    let calls = 0
    await mapWithConcurrency([], 5, async () => {
      calls += 1
    })
    assert.equal(calls, 0)
  })
})
