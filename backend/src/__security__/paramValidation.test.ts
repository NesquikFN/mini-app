import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * VULN-010: раніше param-схеми приймали будь-який рядок, він долітав до
 * Postgres (колонки типу uuid) і падав помилкою 22P02, яку errorHandler
 * показував як 500. Тепер валідація стоїть до звернення до БД.
 */
describe('identifier validation happens before the database', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  const badIds = [
    { label: 'random string', value: 'not-a-uuid' },
    { label: 'path traversal', value: '../../etc/passwd' },
    { label: 'whitespace', value: '%20' },
    { label: 'sql-ish', value: "1' or '1'='1" },
    { label: 'almost a uuid', value: '00000000-0000-0000-0000-00000000zzzz' },
  ]

  for (const { label, value } of badIds) {
    it(`rejects ${label} on GET /api/events/:id with 400 and never queries`, async () => {
      const user = buildUser()
      stubAuthLayer({ users: [user] })
      const findById = mock.method(eventsRepository, 'findById', async () => null)

      const res = await request(app)
        .get(`/api/events/${encodeURIComponent(value)}`)
        .set('Authorization', `Bearer ${tokenFor(user)}`)

      assert.equal(res.status, 400, `${label} should be a client error`)
      assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
      assert.equal(findById.mock.callCount(), 0, 'must not reach the repository')
    })
  }

  it('rejects a bad user id on GET /api/users/:id', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const getPublicUserById = mock.method(usersRepository, 'getPublicUserById', async () => null)

    const res = await request(app)
      .get('/api/users/whatever')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 400)
    assert.equal(getPublicUserById.mock.callCount(), 0)
  })

  it('rejects a bad template id on POST /api/event-templates/:templateId/create-event', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .post('/api/event-templates/not-a-uuid/create-event')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({})

    assert.equal(res.status, 400)
  })

  it('answers 404 (not 500) when the id segment is missing entirely', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .get('/api/users/')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'ROUTE_NOT_FOUND')
  })

  it('accepts a real uuid and a seeded (non-RFC4122) uuid alike', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const findById = mock.method(eventsRepository, 'findById', async () => null)

    for (const id of [
      'f2b1c0d4-7a63-4c2e-9f31-2b7ac9d1e845',
      '00000000-0000-0000-0000-000000000101',
    ]) {
      const res = await request(app)
        .get(`/api/events/${id}`)
        .set('Authorization', `Bearer ${tokenFor(user)}`)
      // Схема пропустила — далі вже доменна відповідь «не знайдено».
      assert.equal(res.status, 404, id)
      assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
    }
    assert.equal(findById.mock.callCount(), 2)
  })

  it('rejects a malformed JSON body with 400 instead of 500', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .set('Content-Type', 'application/json')
      .send('{"nickname": ')

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'INVALID_JSON')
  })
})
