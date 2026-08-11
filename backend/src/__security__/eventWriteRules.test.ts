import './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import request from 'supertest'
import sharp from 'sharp'
import { app } from '../app'
import { eventsRepository } from '../repositories/events.repository'
import {
  MAX_EVENT_PARTICIPANTS,
  assertEventEditable,
  assertEventInvariants,
} from '../services/event-invariants'
import { AppError } from '../utils/AppError'
import { NO_DORMITORY_ID } from '../types/dormitory'
import { kyivNow, addDaysToISODate } from '../utils/kyivTime'
import type { Event } from '../types/event'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/** VULN-005 / VULN-006 / VULN-010. */

const DORM = '00000000-0000-0000-0000-000000000101'
const FUTURE_DATE = addDaysToISODate(kyivNow().date, 30)
const PAST_DATE = addDaysToISODate(kyivNow().date, -1)

function validInvariantInput(overrides: Partial<Parameters<typeof assertEventInvariants>[0]> = {}) {
  return {
    dormitoryId: DORM,
    isOnline: false,
    location: 'Кухня 5 поверху',
    date: FUTURE_DATE,
    time: '18:00',
    maxParticipants: 10,
    ...overrides,
  }
}

function expectAppError(fn: () => void, code: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof AppError, `expected AppError for ${code}`)
    assert.equal(error.code, code)
    return true
  })
}

describe('shared event invariants', () => {
  it('accepts a well-formed offline event', () => {
    assert.doesNotThrow(() => assertEventInvariants(validInvariantInput()))
  })

  it('forbids an offline event for a user without a dormitory', () => {
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ dormitoryId: NO_DORMITORY_ID })),
      'ONLINE_EVENT_REQUIRED',
    )
  })

  it('allows an online event for a user without a dormitory', () => {
    assert.doesNotThrow(() =>
      assertEventInvariants(
        validInvariantInput({ dormitoryId: NO_DORMITORY_ID, isOnline: true, location: 'Онлайн' }),
      ),
    )
  })

  it('requires a physical location for an offline event', () => {
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ location: '   ' })),
      'LOCATION_REQUIRED',
    )
  })

  it('does not require a dormitory-specific place for an online event', () => {
    assert.doesNotThrow(() =>
      assertEventInvariants(validInvariantInput({ isOnline: true, location: '' })),
    )
  })

  it('rejects a date in the past', () => {
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ date: PAST_DATE })),
      'EVENT_DATE_IN_PAST',
    )
  })

  it('rejects today with a time that has already passed (Europe/Kyiv)', () => {
    const now = kyivNow()
    // 00:00 сьогодні вже минуло у будь-який момент після півночі за
    // Києвом; о 00:00 рівно тест не має сенсу, тож пропускаємо цю хвилину.
    if (now.time === '00:00') return
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ date: now.date, time: '00:00' })),
      'EVENT_DATE_IN_PAST',
    )
  })

  it('rejects a participant limit above the supported maximum', () => {
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ maxParticipants: MAX_EVENT_PARTICIPANTS + 1 })),
      'MAX_PARTICIPANTS_OUT_OF_RANGE',
    )
  })

  it('rejects a non-positive participant limit', () => {
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ maxParticipants: 0 })),
      'MAX_PARTICIPANTS_OUT_OF_RANGE',
    )
  })

  it('rejects shrinking the limit below the people already joined', () => {
    expectAppError(
      () =>
        assertEventInvariants(
          validInvariantInput({ maxParticipants: 2, currentParticipantCount: 5 }),
        ),
      'MAX_PARTICIPANTS_TOO_SMALL',
    )
  })

  it('rejects an event that is both VIP-only and GPU-only', () => {
    expectAppError(
      () => assertEventInvariants(validInvariantInput({ vipOnly: true, gpuOnly: true })),
      'VIP_GPU_CONFLICT',
    )
  })

  it('allows VIP-only and GPU-only individually', () => {
    assert.doesNotThrow(() => assertEventInvariants(validInvariantInput({ vipOnly: true })))
    assert.doesNotThrow(() => assertEventInvariants(validInvariantInput({ gpuOnly: true })))
  })

  it('treats a finished event as non-editable', () => {
    expectAppError(
      () => assertEventEditable({ date: PAST_DATE, time: '10:00' }),
      'EVENT_ARCHIVED',
    )
    assert.doesNotThrow(() => assertEventEditable({ date: FUTURE_DATE, time: '10:00' }))
  })
})

// --- Те саме, але через справжній HTTP-маршрут PATCH /api/events/:id ---

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: '00000000-0000-0000-0000-0000000000ee',
    creatorId: '00000000-0000-0000-0000-000000000001',
    title: 'Настолки',
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

describe('PATCH /api/events/:id enforces the same invariants as create', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  function arrangeOwner(event: Event, { vip = false } = {}) {
    const owner = buildUser({ id: event.creatorId, dormitoryId: event.dormitoryId })
    stubAuthLayer({ users: [owner], vips: vip ? [owner.id] : [] })
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    const update = mock.method(eventsRepository, 'update', async () => event)
    return { owner, update }
  }

  it('refuses to turn an online event offline for a user without a dormitory', async () => {
    const event = fakeEvent()
    const { owner, update } = arrangeOwner(event)

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ isOnline: false })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'ONLINE_EVENT_REQUIRED')
    assert.equal(update.mock.callCount(), 0, 'nothing must be written')
  })

  it('refuses to edit an event that has already finished', async () => {
    const event = fakeEvent({ date: PAST_DATE, time: '10:00:00' })
    const { owner, update } = arrangeOwner(event)

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ title: 'Переписана назва' })

    assert.equal(res.status, 409)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_ARCHIVED')
    assert.equal(update.mock.callCount(), 0)
  })

  it('refuses to shrink the limit below current participants', async () => {
    const event = fakeEvent({ participantIds: ['a', 'b', 'c'] })
    const { owner, update } = arrangeOwner(event)

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ maxParticipants: 2 })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'MAX_PARTICIPANTS_TOO_SMALL')
    assert.equal(update.mock.callCount(), 0)
  })

  it('rejects an absurd participant limit with 400 instead of a Postgres error', async () => {
    const event = fakeEvent()
    const { owner, update } = arrangeOwner(event)

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ maxParticipants: 9_999_999_999 })

    assert.equal(res.status, 400)
    assert.equal((res.body as ApiErrorBody).error.code, 'VALIDATION_ERROR')
    assert.equal(update.mock.callCount(), 0)
  })

  it('rejects negative and fractional participant limits', async () => {
    const event = fakeEvent()
    const { owner } = arrangeOwner(event)
    const token = `Bearer ${tokenFor(owner)}`

    for (const maxParticipants of [-5, 2.5]) {
      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set('Authorization', token)
        .send({ maxParticipants })
      assert.equal(res.status, 400, `maxParticipants=${maxParticipants}`)
    }
  })

  it('does not silently rewrite fields the PATCH never mentioned', async () => {
    // Регресія: updateEventSchema колись був createEventSchema.partial(),
    // а `.partial()` у Zod не знімає `.default()`. Через це зміна самої
    // лише назви скидала is_vip_only і is_online у false — тобто
    // редагування VIP-події робило її загальнодоступною.
    const event = fakeEvent({ vipOnly: true, dormitoryId: DORM, isOnline: false, location: 'Хол' })
    const { owner, update } = arrangeOwner(event, { vip: true })

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ title: 'Лише назва' })

    assert.equal(res.status, 200)
    const patch = update.mock.calls[0].arguments[1] as Record<string, unknown>
    assert.deepEqual(Object.keys(patch), ['title'])
    assert.equal('vipOnly' in patch, false)
    assert.equal('isOnline' in patch, false)
    assert.equal('description' in patch, false)
  })

  it('ignores a client-supplied imageUrl instead of storing an external URL', async () => {
    const event = fakeEvent()
    const { owner, update } = arrangeOwner(event)

    const res = await request(app)
      .patch(`/api/events/${event.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ title: 'Нова назва', imageUrl: 'https://attacker.example/tracker.png' })

    assert.equal(res.status, 200)
    assert.equal(update.mock.callCount(), 1)
    const patch = update.mock.calls[0].arguments[1] as Record<string, unknown>
    assert.equal('imageUrl' in patch, false, 'imageUrl must never reach the repository from a PATCH')
    assert.equal(patch.title, 'Нова назва')
  })

  it('rejects javascript: and data: URLs for the game link', async () => {
    const event = fakeEvent()
    const { owner } = arrangeOwner(event)
    const token = `Bearer ${tokenFor(owner)}`

    for (const gameUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set('Authorization', token)
        .send({ gameUrl })
      assert.equal(res.status, 400, gameUrl)
    }
  })
})

describe('PUT /api/events/:id/image', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('lets the creator replace the cover and sets imageUrl server-side', async () => {
    const event = fakeEvent()
    const owner = buildUser({ id: event.creatorId })
    stubAuthLayer({ users: [owner] })
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    const update = mock.method(eventsRepository, 'update', async () => event)

    const jpeg = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .jpeg()
      .toBuffer()

    const res = await request(app)
      .put(`/api/events/${event.id}/image`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)

    assert.equal(res.status, 200)
    assert.equal(update.mock.callCount(), 1)
    const patch = update.mock.calls[0].arguments[1] as { imageUrl?: string }
    assert.match(String(patch.imageUrl), /^https:\/\/backend\.test\/uploads\/.+\/cover\.webp\?v=\d+$/)
  })

  it("refuses a non-creator trying to replace someone else's cover", async () => {
    const event = fakeEvent()
    const stranger = buildUser()
    stubAuthLayer({ users: [stranger] })
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())
    const update = mock.method(eventsRepository, 'update', async () => event)

    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 1, b: 1 } },
    })
      .png()
      .toBuffer()

    const res = await request(app)
      .put(`/api/events/${event.id}/image`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)
      .set('Content-Type', 'image/png')
      .send(png)

    assert.equal(res.status, 403)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_IMAGE_FORBIDDEN')
    assert.equal(update.mock.callCount(), 0)
  })

  it('rejects a body over the size limit with 413, not 500', async () => {
    const event = fakeEvent()
    const owner = buildUser({ id: event.creatorId })
    stubAuthLayer({ users: [owner] })
    mock.method(eventsRepository, 'findById', async () => event)

    const res = await request(app)
      .put(`/api/events/${event.id}/image`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(6 * 1024 * 1024, 0x41))

    assert.equal(res.status, 413)
    assert.equal((res.body as ApiErrorBody).error.code, 'PAYLOAD_TOO_LARGE')
  })

  it('rejects text disguised as a JPEG with 415', async () => {
    const event = fakeEvent()
    const owner = buildUser({ id: event.creatorId })
    stubAuthLayer({ users: [owner] })
    mock.method(eventsRepository, 'findById', async () => event)
    mock.method(eventsRepository, 'findParticipantPreviews', async () => new Map())

    const res = await request(app)
      .put(`/api/events/${event.id}/image`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('<html><script>alert(1)</script></html>'))

    assert.equal(res.status, 415)
    assert.equal((res.body as ApiErrorBody).error.code, 'IMAGE_TYPE_UNSUPPORTED')
  })
})
