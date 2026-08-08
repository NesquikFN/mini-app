/**
 * Integration tests for EventResponse.participantPreview/participantCount
 * (avatar-stack on EventCard) — against the real Express app + live
 * Railway Postgres, same pattern as auth.integration.test.ts.
 * Run via `npm run test:integration --workspace=backend`.
 *
 * Uses telegram_id range 900_000_301-306, distinct from every other
 * integration suite's range.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from '../app'
import { query } from '../config/db'
import { buildValidInitData, nowSeconds, telegramUserField } from '../test-utils/telegramInitData'

const BOT_TOKEN = process.env.BOT_TOKEN
const CREATOR_TELEGRAM_ID = 900_000_301
const JOINER_TELEGRAM_IDS = [900_000_302, 900_000_303, 900_000_304, 900_000_305, 900_000_306]
const ALL_TELEGRAM_IDS = [CREATOR_TELEGRAM_ID, ...JOINER_TELEGRAM_IDS]

before(() => {
  assert.ok(
    BOT_TOKEN,
    'BOT_TOKEN must be set for integration tests — run via `npm run test:integration`',
  )
})

function validInitDataFor(telegramId: number): string {
  return buildValidInitData(
    {
      auth_date: String(nowSeconds()),
      user: telegramUserField(telegramId, `Прев'ю Тест ${telegramId}`, `preview_test_${telegramId}`),
      query_id: 'AAH_preview',
    },
    BOT_TOKEN as string,
  )
}

async function authenticate(telegramId: number): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/telegram')
    .send({ initData: validInitDataFor(telegramId) })
  const dormitoriesRes = await request(app)
    .get('/api/dormitories')
    .set('Authorization', `Bearer ${res.body.token}`)
  await request(app)
    .patch('/api/me')
    .set('Authorization', `Bearer ${res.body.token}`)
    .send({ dormitoryId: dormitoriesRes.body.dormitories[0].id })
  return { token: res.body.token, userId: res.body.user.id }
}

describe('EventResponse.participantPreview / participantCount', () => {
  let creator: { token: string; userId: string }
  let joiners: { token: string; userId: string }[]
  let eventId: string

  before(async () => {
    creator = await authenticate(CREATOR_TELEGRAM_ID)
    joiners = await Promise.all(JOINER_TELEGRAM_IDS.map(authenticate))

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${creator.token}`)
      .send({
        title: 'participantPreview test event',
        description: "Автотест participantPreview, безпечно видалити.",
        date: '2026-12-30',
        time: '15:00',
        location: 'Test room',
        maxParticipants: 10,
      })
    eventId = createRes.body.event.id
  })

  after(async () => {
    if (eventId) await query('delete from events where id = $1', [eventId])
    await query('delete from users where telegram_id = any($1)', [ALL_TELEGRAM_IDS])
  })

  it('a freshly created event has the creator as its only participant (1), preview included', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creator.token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.event.participantCount, 1)
    assert.equal(res.body.event.participantPreview.length, 1)
    assert.equal(res.body.event.participantPreview[0].id, creator.userId)
  })

  it('the creator leaving drops participants to 0 and preview to [] — then rejoins', async () => {
    const leaveRes = await request(app)
      .delete(`/api/events/${eventId}/leave`)
      .set('Authorization', `Bearer ${creator.token}`)

    assert.equal(leaveRes.status, 200)
    assert.equal(leaveRes.body.event.participantCount, 0)
    assert.deepEqual(leaveRes.body.event.participantPreview, [])
    assert.deepEqual(leaveRes.body.event.participants, [])

    const joinRes = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${creator.token}`)
    assert.equal(joinRes.status, 200)
    assert.equal(joinRes.body.event.participantCount, 1)
  })

  it('3 participants total → preview contains exactly all 3', async () => {
    await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${joiners[0].token}`)
    const res = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${joiners[1].token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.event.participantCount, 3)
    assert.equal(res.body.event.participantPreview.length, 3)
  })

  it('6 participants total → preview capped at 3, participantCount and participants[] stay real', async () => {
    await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${joiners[2].token}`)
    await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${joiners[3].token}`)
    const res = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${joiners[4].token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.event.participantCount, 6)
    assert.equal(res.body.event.participantPreview.length, 3)
    // Existing field untouched: still the full id list, not capped.
    assert.equal(res.body.event.participants.length, 6)
  })

  it('GET /api/events (list) carries the same participantPreview/participantCount — no N+1', async () => {
    const res = await request(app)
      .get('/api/events?scope=all')
      .set('Authorization', `Bearer ${creator.token}`)

    assert.equal(res.status, 200)
    const event = res.body.events.find((item: { id: string }) => item.id === eventId)
    assert.ok(event, 'event should be present in GET /api/events')
    assert.equal(event.participantCount, 6)
    assert.equal(event.participantPreview.length, 3)
    assert.ok(Array.isArray(event.participants))
    assert.equal(event.participants.length, 6)
  })

  it('participantPreview members are PublicUser-shaped — no telegramId or ban fields leak', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creator.token}`)

    const allowedKeys = new Set(['id', 'firstName', 'username', 'photoUrl', 'dormitoryId'])
    assert.ok(res.body.event.participantPreview.length > 0)
    for (const member of res.body.event.participantPreview) {
      for (const key of Object.keys(member)) {
        assert.ok(allowedKeys.has(key), `unexpected field "${key}" on participantPreview member`)
      }
    }

    const serialized = JSON.stringify(res.body)
    for (const forbidden of ['telegramId', 'bannedUntil', 'bannedPermanently']) {
      assert.ok(!serialized.includes(forbidden), `participantPreview leaked "${forbidden}"`)
    }
  })

  it('GET /api/events/:id existing contract (event/creator/participants) still works unchanged', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creator.token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.creator.id, creator.userId)
    assert.ok(Array.isArray(res.body.participants))
    assert.equal(res.body.participants.length, 6)
  })
})
