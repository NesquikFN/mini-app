import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import * as db from '../config/db'
import { quickPlansRepository } from '../repositories/quick-plans.repository'
import { usersRepository } from '../repositories/users.repository'
import { notificationLogRepository } from '../repositories/notification-log.repository'
import { MAX_ACTIVE_PLANS_PER_USER } from '../services/quick-plans.service'
import { NO_DORMITORY_ID } from '../types/dormitory'
import type {
  NewQuickPlan,
  QuickPlanWithParticipants,
} from '../repositories/quick-plans.repository'
import { buildUser, stubAuthLayer, tokenFor, userWithStatus } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * Швидкі плани «Хто зі мною?». Перевіряється справжній Express-застосунок
 * із справжнім ланцюгом middleware (автентифікація, гейт реєстрації,
 * бани, лімітери) — підміняється лише шар доступу до даних і мережа
 * Telegram, як і в решті security-тестів.
 */

const DORM_A = '00000000-0000-0000-0000-000000000101'
const DORM_B = '00000000-0000-0000-0000-000000000102'
const PLAN_ID = '00000000-0000-0000-0000-0000000000a1'

function fakePlan(overrides: Partial<QuickPlanWithParticipants> = {}): QuickPlanWithParticipants {
  return {
    id: PLAN_ID,
    creatorId: '00000000-0000-0000-0000-000000000001',
    text: 'Йду грати у футбол о 19:00',
    category: 'sport',
    isOnline: false,
    dormitoryId: DORM_A,
    expiresAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    participantIds: [],
    ...overrides,
  }
}

/** Профілі учасників/авторів приходять одним batch-запитом — тестам
 * достатньо порожнього списку, сервіс підставить запасне ім'я. */
function stubPublicUsers() {
  mock.method(usersRepository, 'getPublicUsersByIds', async () => [])
}

function validBody() {
  return {
    text: 'Хто в їдальню через півгодини?',
    category: 'food',
    isOnline: false,
    lifetime: '6h',
  }
}

/** Підміняє саме pool.query — останній крок перед мережею, тож тест
 * бачить рівно той SQL, який пішов би в Postgres. */
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

/** Рядок, який репозиторій справді збирався записати. Окремий хелпер,
 * щоб кожна перевірка не повторювала розбір аргументів мока. */
function insertedPlan(call: { arguments: (NewQuickPlan | undefined)[] }): NewQuickPlan {
  const written = call.arguments[0]
  assert.ok(written, 'insert must be called with a plan')
  return written
}

describe('creating a quick plan', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('creates a valid plan and takes creator and dormitory from the session', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubPublicUsers()
    mock.method(quickPlansRepository, 'countActiveByCreator', async () => 0)
    const insert = mock.method(quickPlansRepository, 'insert', async () =>
      fakePlan({ creatorId: user.id }),
    )

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(validBody())

    assert.equal(res.status, 201)
    assert.equal(insert.mock.callCount(), 1)
    const written = insertedPlan(insert.mock.calls[0])
    assert.equal(written.creatorId, user.id)
    assert.equal(written.dormitoryId, DORM_A)
    assert.equal(typeof written.expiresAt, 'string')
  })

  it('rejects text shorter than 10 characters', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const insert = mock.method(quickPlansRepository, 'insert', async () => fakePlan())

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ ...validBody(), text: 'футбол' })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(insert.mock.callCount(), 0)
  })

  it('rejects whitespace-only text that would otherwise pass the length check', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const insert = mock.method(quickPlansRepository, 'insert', async () => fakePlan())

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ ...validBody(), text: '                    ' })

    assert.equal(res.status, 400)
    assert.equal(insert.mock.callCount(), 0)
  })

  it('rejects text longer than 180 characters', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const insert = mock.method(quickPlansRepository, 'insert', async () => fakePlan())

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ ...validBody(), text: 'а'.repeat(181) })

    assert.equal(res.status, 400)
    assert.equal(insert.mock.callCount(), 0)
  })

  it(`refuses more than ${MAX_ACTIVE_PLANS_PER_USER} active plans from one user`, async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    mock.method(quickPlansRepository, 'countActiveByCreator', async () => MAX_ACTIVE_PLANS_PER_USER)
    const insert = mock.method(quickPlansRepository, 'insert', async () => fakePlan())

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(validBody())

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'QUICK_PLAN_LIMIT_REACHED')
    assert.equal(insert.mock.callCount(), 0)
  })

  it('refuses an offline plan from a user without a dormitory', async () => {
    const user = buildUser({ dormitoryId: NO_DORMITORY_ID })
    stubAuthLayer({ users: [user] })
    mock.method(quickPlansRepository, 'countActiveByCreator', async () => 0)
    const insert = mock.method(quickPlansRepository, 'insert', async () => fakePlan())

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ ...validBody(), isOnline: false })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'ONLINE_PLAN_REQUIRED')
    assert.equal(insert.mock.callCount(), 0)
  })

  it('lets a user without a dormitory create an online plan (with no dormitory attached)', async () => {
    const user = buildUser({ dormitoryId: NO_DORMITORY_ID })
    stubAuthLayer({ users: [user] })
    stubPublicUsers()
    mock.method(quickPlansRepository, 'countActiveByCreator', async () => 0)
    const insert = mock.method(quickPlansRepository, 'insert', async () =>
      fakePlan({ isOnline: true, dormitoryId: undefined }),
    )

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ ...validBody(), isOnline: true })

    assert.equal(res.status, 201)
    const written = insertedPlan(insert.mock.calls[0])
    assert.equal(written.isOnline, true)
    assert.equal(written.dormitoryId, null, 'an online plan must not carry a dormitory')
  })

  it('ignores creatorId and dormitoryId supplied in the request body', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubPublicUsers()
    mock.method(quickPlansRepository, 'countActiveByCreator', async () => 0)
    const insert = mock.method(quickPlansRepository, 'insert', async () =>
      fakePlan({ creatorId: user.id }),
    )

    const res = await request(app)
      .post('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({
        ...validBody(),
        creatorId: '00000000-0000-0000-0000-0000000000ff',
        dormitoryId: DORM_B,
        expiresAt: '2099-01-01T00:00:00.000Z',
      })

    assert.equal(res.status, 201)
    const written = insertedPlan(insert.mock.calls[0])
    assert.equal(written.creatorId, user.id, 'creatorId must come from the session')
    assert.equal(written.dormitoryId, DORM_A, 'dormitoryId must come from the session')
    // expiresAt рахує сервер із lifetime — 6 годин, а не 2099 рік із тіла.
    assert.ok(
      new Date(written.expiresAt).getTime() < Date.now() + 7 * 60 * 60_000,
      'expiresAt must be derived from lifetime, not taken from the body',
    )
  })
})

describe('quick plan visibility', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('filters expired plans and foreign dormitories in SQL, not in JS', async () => {
    const query = stubQuery([])
    await quickPlansRepository.findVisible(DORM_A)

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /p\.expires_at > now\(\)/)
    assert.match(sql, /p\.is_online = true or p\.dormitory_id = \$1/)
    assert.deepEqual(query.mock.calls[0].arguments[1], [DORM_A])
  })

  it('shows only online plans to a viewer with no dormitory scope', async () => {
    const query = stubQuery([])
    await quickPlansRepository.findVisible(undefined)

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /p\.is_online = true/)
    assert.doesNotMatch(sql, /dormitory_id = \$1/)
  })

  it('never scopes offline plans to the "no dormitory" pseudo-dormitory', async () => {
    const user = buildUser({ dormitoryId: NO_DORMITORY_ID })
    stubAuthLayer({ users: [user] })
    stubPublicUsers()
    const findVisible = mock.method(quickPlansRepository, 'findVisible', async () => [])

    await request(app)
      .get('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(findVisible.mock.calls[0].arguments[0], undefined)
  })

  it("hides another dormitory's offline plan behind a plain 404 on direct GET-by-join", async () => {
    const stranger = buildUser({ dormitoryId: DORM_B })
    stubAuthLayer({ users: [stranger] })
    mock.method(quickPlansRepository, 'findById', async () => fakePlan({ dormitoryId: DORM_A }))
    const addParticipant = mock.method(quickPlansRepository, 'addParticipant', async () => true)

    const res = await request(app)
      .post(`/api/quick-plans/${PLAN_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'QUICK_PLAN_NOT_FOUND')
    assert.equal(addParticipant.mock.callCount(), 0, 'must never touch the plan')
  })

  it('lets any approved user join an online plan regardless of dormitory', async () => {
    const user = buildUser({ dormitoryId: DORM_B })
    const author = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user, author] })
    stubPublicUsers()
    mock.method(usersRepository, 'getPublicUserById', async () => null)
    mock.method(quickPlansRepository, 'findById', async () =>
      fakePlan({ creatorId: author.id, isOnline: true, dormitoryId: undefined }),
    )
    const addParticipant = mock.method(quickPlansRepository, 'addParticipant', async () => true)

    const res = await request(app)
      .post(`/api/quick-plans/${PLAN_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(addParticipant.mock.callCount(), 1)
  })

  it('treats an expired plan as non-existent (repository already filtered it out)', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    mock.method(quickPlansRepository, 'findById', async () => null)

    const res = await request(app)
      .post(`/api/quick-plans/${PLAN_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'QUICK_PLAN_NOT_FOUND')
  })
})

describe('joining and leaving a quick plan', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('makes a repeated join idempotent in SQL instead of inserting a duplicate', async () => {
    const query = stubQuery([])
    await quickPlansRepository.addParticipant(PLAN_ID, '00000000-0000-0000-0000-000000000002')

    const sql = sqlOf(query.mock.calls[0])
    assert.match(sql, /on conflict \(plan_id, user_id\) do nothing/)
  })

  it('does not notify the author again when the same user joins twice', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    const author = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user, author] })
    stubPublicUsers()
    mock.method(usersRepository, 'getPublicUserById', async () => null)
    mock.method(quickPlansRepository, 'findById', async () => fakePlan({ creatorId: author.id }))
    // Другий join не вставив рядок — репозиторій повертає false.
    mock.method(quickPlansRepository, 'addParticipant', async () => false)

    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('no DM expected for a repeated join')
    }) as typeof fetch

    const res = await request(app)
      .post(`/api/quick-plans/${PLAN_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(fetchCalls, 0, 'a repeated join must stay silent')
  })

  it('never lets the author join their own plan', async () => {
    const author = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [author] })
    mock.method(quickPlansRepository, 'findById', async () => fakePlan({ creatorId: author.id }))
    const addParticipant = mock.method(quickPlansRepository, 'addParticipant', async () => true)

    const res = await request(app)
      .post(`/api/quick-plans/${PLAN_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(author)}`)

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'QUICK_PLAN_OWN_PLAN')
    assert.equal(addParticipant.mock.callCount(), 0)
  })

  it('keeps a successful join even when the Telegram DM fails', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    const author = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user, author] })
    stubPublicUsers()
    mock.method(usersRepository, 'getPublicUserById', async () => ({
      id: user.id,
      firstName: user.firstName,
    }))
    mock.method(quickPlansRepository, 'findById', async () => fakePlan({ creatorId: author.id }))
    const addParticipant = mock.method(quickPlansRepository, 'addParticipant', async () => true)
    mock.method(notificationLogRepository, 'log', async () => undefined)

    globalThis.fetch = (async () => {
      throw new Error('Telegram is down')
    }) as typeof fetch

    const res = await request(app)
      .post(`/api/quick-plans/${PLAN_ID}/join`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200, 'a Telegram outage must not roll the join back')
    assert.equal(addParticipant.mock.callCount(), 1)
  })

  it('lets a participant leave, and refuses to leave twice', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubPublicUsers()
    mock.method(quickPlansRepository, 'findById', async () => fakePlan())
    const removeParticipant = mock.method(quickPlansRepository, 'removeParticipant', async () => true)

    const leaveRes = await request(app)
      .delete(`/api/quick-plans/${PLAN_ID}/leave`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
    assert.equal(leaveRes.status, 200)
    assert.equal(removeParticipant.mock.callCount(), 1)

    removeParticipant.mock.mockImplementation(async () => false)
    const secondRes = await request(app)
      .delete(`/api/quick-plans/${PLAN_ID}/leave`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
    assert.equal(secondRes.status, 409)
    assert.equal((secondRes.body as ApiErrorBody).error.code, 'QUICK_PLAN_NOT_JOINED')
  })

  it('sends no Telegram message on leave', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubPublicUsers()
    mock.method(quickPlansRepository, 'findById', async () => fakePlan())
    mock.method(quickPlansRepository, 'removeParticipant', async () => true)

    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('leave must never message anyone')
    }) as typeof fetch

    await request(app)
      .delete(`/api/quick-plans/${PLAN_ID}/leave`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(fetchCalls, 0)
  })
})

describe('deleting a quick plan', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('lets the author delete their own plan', async () => {
    const author = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [author] })
    mock.method(quickPlansRepository, 'findById', async () => fakePlan({ creatorId: author.id }))
    const remove = mock.method(quickPlansRepository, 'remove', async () => true)

    const res = await request(app)
      .delete(`/api/quick-plans/${PLAN_ID}`)
      .set('Authorization', `Bearer ${tokenFor(author)}`)

    assert.equal(res.status, 200)
    assert.equal(remove.mock.callCount(), 1)
  })

  it("refuses to delete somebody else's plan", async () => {
    const stranger = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [stranger] })
    mock.method(quickPlansRepository, 'findById', async () => fakePlan())
    const remove = mock.method(quickPlansRepository, 'remove', async () => true)

    const res = await request(app)
      .delete(`/api/quick-plans/${PLAN_ID}`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'QUICK_PLAN_OWNER_REQUIRED')
    assert.equal(remove.mock.callCount(), 0)
  })

  it('refuses a regular user on the admin delete route with 403', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const remove = mock.method(quickPlansRepository, 'remove', async () => true)

    const res = await request(app)
      .delete(`/api/admin/quick-plans/${PLAN_ID}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')
    assert.equal(remove.mock.callCount(), 0)
  })

  it("lets an admin delete anyone's plan, including another dormitory's", async () => {
    const admin = buildUser({ dormitoryId: DORM_B })
    stubAuthLayer({ users: [admin], admins: [admin.id] })
    const remove = mock.method(quickPlansRepository, 'remove', async () => true)

    const res = await request(app)
      .delete(`/api/admin/quick-plans/${PLAN_ID}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    assert.equal(res.status, 200)
    assert.equal(remove.mock.callCount(), 1)
  })

  it('refuses a non-admin on the admin quick-plans list', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })

    const res = await request(app)
      .get('/api/admin/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')
  })
})

describe('quick plans respect the existing auth, registration and ban gates', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/quick-plans')
    assert.equal(res.status, 401)
    assert.equal((res.body as ApiErrorBody).error.code, 'UNAUTHORIZED')
  })

  for (const status of ['not_submitted', 'pending', 'rejected'] as const) {
    it(`blocks '${status}' from the quick plans API with 403 REGISTRATION_REQUIRED`, async () => {
      const user = userWithStatus(status)
      stubAuthLayer({ users: [user] })
      const findVisible = mock.method(quickPlansRepository, 'findVisible', async () => [])

      const res = await request(app)
        .get('/api/quick-plans')
        .set('Authorization', `Bearer ${tokenFor(user)}`)

      assert.equal(res.status, 403)
      assert.equal((res.body as ApiErrorBody).error.code, 'REGISTRATION_REQUIRED')
      assert.equal(findVisible.mock.callCount(), 0)
    })
  }

  it('blocks a banned user with USER_BANNED before any plan is read', async () => {
    const user = buildUser({ bannedPermanently: true })
    stubAuthLayer({ users: [user] })
    const findVisible = mock.method(quickPlansRepository, 'findVisible', async () => [])

    const res = await request(app)
      .get('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'USER_BANNED')
    assert.equal(findVisible.mock.callCount(), 0)
  })

  it('rejects a malformed plan id before reaching the repository', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    const findById = mock.method(quickPlansRepository, 'findById', async () => null)

    const res = await request(app)
      .post('/api/quick-plans/not-a-uuid/join')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(findById.mock.callCount(), 0)
  })

  it('excludes the author from the participants list and reports joined per viewer', async () => {
    const viewer = buildUser({ dormitoryId: DORM_A })
    const author = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [viewer, author] })
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [
      { id: author.id, firstName: 'Автор' },
      { id: viewer.id, firstName: 'Глядач' },
    ])
    mock.method(quickPlansRepository, 'findVisible', async () => [
      fakePlan({ creatorId: author.id, participantIds: [viewer.id] }),
    ])

    const res = await request(app)
      .get('/api/quick-plans')
      .set('Authorization', `Bearer ${tokenFor(viewer)}`)

    assert.equal(res.status, 200)
    const [plan] = res.body.plans
    assert.equal(plan.participantCount, 1)
    assert.equal(plan.joined, true, 'the viewer already responded')
    assert.deepEqual(
      plan.participants.map((participant: { id: string }) => participant.id),
      [viewer.id],
      'the author must not appear among the responders',
    )
  })
})
