import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import { app } from '../app'
import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { gpusRepository } from '../repositories/gpus.repository'
import { vipsRepository } from '../repositories/vips.repository'
import { adminRepository } from '../repositories/admin.repository'
import { settingsRepository } from '../repositories/settings.repository'
import { NO_DORMITORY_ID } from '../types/dormitory'
import { kyivNow, addDaysToISODate } from '../utils/kyivTime'
import type { Event } from '../types/event'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * ГПУ — незалежна від VIP роль, той самий шаблон доступу (див.
 * database/migrations/0026_gpu_role_and_events.sql і events.service.ts).
 * Ці тести перевіряють ізоляцію: VIP без ГПУ не бачить ГПУ-подій, ГПУ
 * без VIP не бачить VIP-подій, а для недоступної ГПУ-події видається
 * та сама 404 EVENT_NOT_FOUND відповідь, що й для VIP — без розкриття
 * самого факту існування події.
 */

const DORM = '00000000-0000-0000-0000-000000000101'
const FUTURE_DATE = addDaysToISODate(kyivNow().date, 30)

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: '00000000-0000-0000-0000-0000000000ee',
    creatorId: '00000000-0000-0000-0000-000000000001',
    title: 'Закрита гра',
    description: '',
    isOnline: true,
    vipOnly: false,
    gpuOnly: false,
    date: FUTURE_DATE,
    time: '18:00:00',
    location: 'Онлайн',
    maxParticipants: 10,
    participantIds: [],
    createdAt: new Date().toISOString(),
    dormitoryId: NO_DORMITORY_ID,
    ...overrides,
  }
}

describe('GPU/VIP event visibility isolation', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('a plain user never sees VIP or GPU events in the list (repository queried with both flags off)', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const findAll = mock.method(eventsRepository, 'findAll', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    const res = await request(app)
      .get('/api/events?scope=all')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(findAll.mock.callCount(), 1)
    const [, includeVip, , includeGpu] = findAll.mock.calls[0].arguments
    assert.equal(includeVip, false)
    assert.equal(includeGpu, false)
  })

  it('a VIP-without-GPU user is queried with includeVip=true, includeGpu=false', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user], vips: [user.id] })
    const findAll = mock.method(eventsRepository, 'findAll', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    await request(app)
      .get('/api/events?scope=all')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    const [, includeVip, , includeGpu] = findAll.mock.calls[0].arguments
    assert.equal(includeVip, true)
    assert.equal(includeGpu, false)
  })

  it('a GPU-without-VIP user is queried with includeVip=false, includeGpu=true', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user], gpus: [user.id] })
    const findAll = mock.method(eventsRepository, 'findAll', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    await request(app)
      .get('/api/events?scope=all')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    const [, includeVip, , includeGpu] = findAll.mock.calls[0].arguments
    assert.equal(includeVip, false)
    assert.equal(includeGpu, true)
  })

  it('a user with both roles is queried with both flags on', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user], vips: [user.id], gpus: [user.id] })
    const findAll = mock.method(eventsRepository, 'findAll', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    await request(app)
      .get('/api/events?scope=all')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    const [, includeVip, , includeGpu] = findAll.mock.calls[0].arguments
    assert.equal(includeVip, true)
    assert.equal(includeGpu, true)
  })

  it('GET /api/events/:id on a GPU-only event returns 404 EVENT_NOT_FOUND for a plain user', async () => {
    const event = fakeEvent({ gpuOnly: true })
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    mock.method(eventsRepository, 'findById', async () => event)

    const res = await request(app)
      .get(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
  })

  it('GET /api/events/:id on a GPU-only event returns 404 for a VIP-without-GPU user (same response as a stranger)', async () => {
    const event = fakeEvent({ gpuOnly: true })
    const user = buildUser()
    stubAuthLayer({ users: [user], vips: [user.id] })
    mock.method(eventsRepository, 'findById', async () => event)

    const res = await request(app)
      .get(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
  })

  it('GET /api/events/:id on a VIP-only event returns 404 for a GPU-without-VIP user', async () => {
    const event = fakeEvent({ vipOnly: true })
    const user = buildUser()
    stubAuthLayer({ users: [user], gpus: [user.id] })
    mock.method(eventsRepository, 'findById', async () => event)

    const res = await request(app)
      .get(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
  })

  it('GET /api/events/:id succeeds for a GPU user on a GPU-only event', async () => {
    const event = fakeEvent({ gpuOnly: true })
    const user = buildUser()
    stubAuthLayer({ users: [user], gpus: [user.id] })
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])

    const res = await request(app)
      .get(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.event.gpuOnly, true)
  })

  it('a user with both roles can open both a VIP-only and a GPU-only event', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user], vips: [user.id], gpus: [user.id] })
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    mock.method(usersRepository, 'getPublicUsersByIds', async () => [])

    for (const overrides of [{ vipOnly: true }, { gpuOnly: true }]) {
      const event = fakeEvent(overrides)
      mock.method(eventsRepository, 'findById', async () => event)
      const res = await request(app)
        .get(`/api/events/${event.id}`)
        .set('Authorization', `Bearer ${tokenFor(user)}`)
      assert.equal(res.status, 200, JSON.stringify(overrides))
    }
  })
})

describe('joining and creating GPU-only events without the role', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('POST /api/events/:id/join on a GPU-only event is refused before ever touching the repository', async () => {
    const event = fakeEvent({ gpuOnly: true })
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    mock.method(eventsRepository, 'findById', async () => event)
    const addParticipant = mock.method(eventsRepository, 'addParticipant', async () => {})

    const res = await request(app)
      .post(`/api/events/${event.id}/join`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
    assert.equal(addParticipant.mock.callCount(), 0, 'must never reach the join_event() call')
  })

  it('POST /api/events refuses gpuOnly:true from a non-GPU creator with 403', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })
    const insert = mock.method(eventsRepository, 'insert', async () => fakeEvent())

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({
        title: 'Спроба ГПУ-події',
        date: FUTURE_DATE,
        time: '19:00',
        location: 'Хол',
        maxParticipants: 5,
        isOnline: true,
        gpuOnly: true,
      })

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'GPU_ACCESS_REQUIRED')
    assert.equal(insert.mock.callCount(), 0)
  })

  it('POST /api/events rejects an event that is both vipOnly and gpuOnly with 400, before reaching the service', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user], vips: [user.id], gpus: [user.id] })
    const insert = mock.method(eventsRepository, 'insert', async () => fakeEvent())

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({
        title: 'Одночасно VIP і ГПУ',
        date: FUTURE_DATE,
        time: '19:00',
        location: 'Хол',
        maxParticipants: 5,
        isOnline: true,
        vipOnly: true,
        gpuOnly: true,
      })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(insert.mock.callCount(), 0)
  })

  it('a GPU user (without VIP) can create a GPU-only event', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user], gpus: [user.id] })
    const created = fakeEvent({ creatorId: user.id, gpuOnly: true, dormitoryId: user.dormitoryId! })
    mock.method(eventsRepository, 'insert', async () => created)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    mock.method(usersRepository, 'getPublicUserById', async () => null)
    mock.method(usersRepository, 'getSubscribedTelegramIds', async () => [])
    mock.method(settingsRepository, 'getNotificationSettings', async () => ({}))

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({
        title: 'ГПУ-подія',
        date: FUTURE_DATE,
        time: '19:00',
        location: 'Хол',
        maxParticipants: 5,
        isOnline: true,
        gpuOnly: true,
      })

    assert.equal(res.status, 201)
    assert.equal(res.body.event.gpuOnly, true)
  })
})

describe('PATCH /api/events/:id enforces GPU access the same way it enforces VIP', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  function arrangeOwner(event: Event, { gpu = false } = {}) {
    const owner = buildUser({ id: event.creatorId, dormitoryId: event.dormitoryId })
    stubAuthLayer({ users: [owner], gpus: gpu ? [owner.id] : [] })
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    const update = mock.method(eventsRepository, 'update', async () => event)
    return { owner, update }
  }

  it('refuses to flip gpuOnly on for a creator without the GPU role', async () => {
    const event = fakeEvent()
    const { owner, update } = arrangeOwner(event)

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ gpuOnly: true })

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
    assert.equal(update.mock.callCount(), 0)
  })

  it('rejects a PATCH that sets both vipOnly and gpuOnly to true in the same body', async () => {
    const event = fakeEvent({ dormitoryId: DORM, isOnline: false, location: 'Хол' })
    const { owner, update } = arrangeOwner(event, { gpu: true })

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ vipOnly: true, gpuOnly: true })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(update.mock.callCount(), 0)
  })

  it('lets a GPU creator turn their own event into a GPU-only event', async () => {
    const event = fakeEvent({ dormitoryId: DORM, isOnline: false, location: 'Хол' })
    const { owner, update } = arrangeOwner(event, { gpu: true })

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ gpuOnly: true })

    assert.equal(res.status, 200)
    assert.equal(update.mock.callCount(), 1)
    const patch = update.mock.calls[0].arguments[1] as Record<string, unknown>
    assert.equal(patch.gpuOnly, true)
  })
})

describe("/me/events and public profile never leak GPU-only events to a viewer without the role", () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('GET /api/me/events filters out a GPU-only created event for a non-GPU owner viewing as themselves', async () => {
    // The creator lost the GPU role after creating the event (e.g. admin
    // revoked it) — the event must vanish from their own /me/events too,
    // exactly like a VIP event would for a de-VIP'd creator.
    const owner = buildUser()
    stubAuthLayer({ users: [owner] })
    mock.method(eventsRepository, 'getUserCreatedEvents', async () => [
      fakeEvent({ creatorId: owner.id, gpuOnly: true }),
    ])
    mock.method(eventsRepository, 'getUserParticipatingEvents', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    const res = await request(app)
      .get('/api/me/events')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body.created, [])
  })

  it('GET /api/users/:id hides a GPU-only created event from a viewer without the GPU role', async () => {
    const target = buildUser()
    const viewer = buildUser()
    stubAuthLayer({ users: [target, viewer] })
    mock.method(usersRepository, 'getPublicUserById', async () => ({
      id: target.id,
      firstName: target.firstName,
    }))
    mock.method(eventsRepository, 'getUserCreatedEvents', async () => [
      fakeEvent({ creatorId: target.id, gpuOnly: true }),
    ])
    mock.method(eventsRepository, 'getUserParticipatingEvents', async () => [])
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    const res = await request(app)
      .get(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${tokenFor(viewer)}`)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body.createdEvents, [])
    assert.equal(res.body.isGpu, false)
  })
})

describe('admin GPU role management', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('rejects a non-admin from every /api/admin/gpus endpoint', async () => {
    const user = buildUser()
    stubAuthLayer({ users: [user] })

    const getRes = await request(app)
      .get('/api/admin/gpus')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
    assert.equal(getRes.status, 403)
    assert.equal((getRes.body as ApiErrorBody).error.code, 'ADMIN_ACCESS_REQUIRED')

    const postRes = await request(app)
      .post('/api/admin/gpus')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ telegramId: 123 })
    assert.equal(postRes.status, 403)

    const deleteRes = await request(app)
      .delete(`/api/admin/gpus/${user.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
    assert.equal(deleteRes.status, 403)
  })

  it('lets an admin add and remove the GPU role by telegramId', async () => {
    const admin = buildUser()
    const target = buildUser()
    stubAuthLayer({ users: [admin, target] })
    mock.method(adminRepository, 'isAdmin', async (id: string) => id === admin.id)
    mock.method(usersRepository, 'getUserByTelegramId', async () => target)
    mock.method(usersRepository, 'getAdminUserById', async () => ({
      id: target.id,
      telegramId: target.telegramId,
      firstName: target.firstName,
      registrationStatus: target.registrationStatus,
      createdAt: new Date().toISOString(),
      bannedPermanently: false,
    }))
    const addGpu = mock.method(gpusRepository, 'addGpu', async () => ({
      userId: target.id,
      gpuSince: new Date().toISOString(),
    }))
    const removeGpu = mock.method(gpusRepository, 'removeGpu', async () => true)

    const addRes = await request(app)
      .post('/api/admin/gpus')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ telegramId: target.telegramId })
    assert.equal(addRes.status, 201)
    assert.equal(addRes.body.gpu.id, target.id)
    assert.equal(addGpu.mock.callCount(), 1)

    const removeRes = await request(app)
      .delete(`/api/admin/gpus/${target.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    assert.equal(removeRes.status, 200)
    assert.equal(removeGpu.mock.callCount(), 1)
  })

  it('assigning GPU never grants VIP, and vice versa — the two roles stay independent', async () => {
    const admin = buildUser()
    const target = buildUser()
    stubAuthLayer({ users: [admin, target] })
    mock.method(adminRepository, 'isAdmin', async (id: string) => id === admin.id)
    mock.method(usersRepository, 'getUserByTelegramId', async () => target)
    mock.method(usersRepository, 'getAdminUserById', async () => ({
      id: target.id,
      telegramId: target.telegramId,
      firstName: target.firstName,
      registrationStatus: target.registrationStatus,
      createdAt: new Date().toISOString(),
      bannedPermanently: false,
    }))
    mock.method(gpusRepository, 'addGpu', async () => ({
      userId: target.id,
      gpuSince: new Date().toISOString(),
    }))
    const vipIsVip = mock.method(vipsRepository, 'isVip', async () => false)

    await request(app)
      .post('/api/admin/gpus')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ telegramId: target.telegramId })

    // Granting GPU never consults or mutates the VIP table.
    assert.equal(vipIsVip.mock.callCount(), 0)
  })
})
