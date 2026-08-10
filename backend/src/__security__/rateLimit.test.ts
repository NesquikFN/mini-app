import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import { RATE_LIMITS } from '../middleware/rateLimit'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * VULN-003. Тести б'ють у справжній app зі справжніми лімітерами з
 * middleware/rateLimit.ts — жодних окремих «тестових» лімітерів із
 * власними значеннями, інакше перевірялася б копія конфігурації.
 *
 * Кожен файл тестів node:test виконує в окремому процесі, тож стан
 * MemoryStore не тече в інші файли. Всередині файлу тести навмисно
 * розведені по різних клієнтських IP, щоб не ділити один кошик.
 */

/** Тіло, яке гарантовано не доходить до БД: auth без initData падає на
 * валідації, POST /api/events — на Zod. Нас цікавить лише лічильник. */
async function hammerAuth(times: number, forwardedFor?: string): Promise<number[]> {
  const statuses: number[] = []
  for (let i = 0; i < times; i += 1) {
    const req = request(app).post('/api/auth/telegram').send({})
    if (forwardedFor) req.set('X-Forwarded-For', forwardedFor)
    const res = await req
    statuses.push(res.status)
  }
  return statuses
}

describe('auth rate limiter (per IP, before authentication)', () => {
  it('allows normal traffic and then returns 429 in the API error format', async () => {
    const allowed = RATE_LIMITS.authPer15Minutes
    const statuses = await hammerAuth(allowed + 1)

    assert.equal(
      statuses.slice(0, allowed).every((status) => status !== 429),
      true,
      'requests within the limit must not be throttled',
    )
    assert.equal(statuses[allowed], 429)

    const throttled = await request(app).post('/api/auth/telegram').send({})
    assert.equal(throttled.status, 429)
    const body = throttled.body as ApiErrorBody
    assert.equal(body.error.code, 'RATE_LIMITED')
    assert.equal(typeof body.error.message, 'string')
    // Конфігурація лімітера назовні не публікується.
    assert.equal(throttled.headers['ratelimit-limit'], undefined)
    assert.equal(throttled.headers['x-ratelimit-limit'], undefined)
  })

  it('cannot be bypassed by spoofing the left-hand X-Forwarded-For entry', async () => {
    // Railway дописує справжній IP клієнта праворуч. trust proxy = 1
    // означає, що Express бере саме цей, останній запис — підроблений
    // лівий не створює нового кошика.
    const realClient = '203.0.113.7'
    const allowed = RATE_LIMITS.authPer15Minutes
    const statuses: number[] = []
    for (let i = 0; i < allowed + 1; i += 1) {
      const spoofed = `198.51.100.${i % 200}`
      const [status] = await hammerAuth(1, `${spoofed}, ${realClient}`)
      statuses.push(status)
    }

    assert.equal(statuses[allowed], 429, 'rotating the spoofed XFF entry must not reset the bucket')
  })

  it('keeps a separate bucket for a genuinely different client IP', async () => {
    const res = await request(app)
      .post('/api/auth/telegram')
      .set('X-Forwarded-For', `198.51.100.1, 192.0.2.55`)
      .send({})

    assert.notEqual(res.status, 429)
  })
})

describe('per-user write limits', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('throttles event creation per user without affecting another user', async () => {
    const author = buildUser()
    const bystander = buildUser()
    stubAuthLayer({ users: [author, bystander] })

    const allowed = RATE_LIMITS.createEventPerHour
    const authorToken = `Bearer ${tokenFor(author)}`

    const statuses: number[] = []
    for (let i = 0; i < allowed + 1; i += 1) {
      // Порожнє тіло: Zod поверне 400, але лічильник лімітера вже
      // спрацював — саме він тут і перевіряється.
      const res = await request(app).post('/api/events').set('Authorization', authorToken).send({})
      statuses.push(res.status)
    }

    assert.equal(
      statuses.slice(0, allowed).every((status) => status === 400),
      true,
      'requests within the limit reach validation',
    )
    assert.equal(statuses[allowed], 429)
    assert.equal(
      ((await request(app).post('/api/events').set('Authorization', authorToken).send({})).body as ApiErrorBody)
        .error.code,
      'RATE_LIMITED',
    )

    // Той самий IP, інший користувач — ключ лімітера це users.id, тож
    // сусід по NAT гуртожитку не постраждав.
    const other = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(bystander)}`)
      .send({})
    assert.equal(other.status, 400)
  })
})
