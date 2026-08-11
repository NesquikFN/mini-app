import { TEST_UPLOADS_DIR } from './testEnv'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import sharp from 'sharp'
import { app } from '../app'
import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { dormitoriesRepository } from '../repositories/dormitories.repository'
import { signShareToken } from '../services/share-token.service'
import { getTelegramProfilePhoto } from '../services/telegram-notifications.service'
import {
  renderShareCard,
  SHARE_CARD_SIZES,
  escapeXml,
  wrapText,
  truncateLine,
  initialOf,
  loadParticipantAvatar,
  type ShareCardInput,
} from '../utils/shareCard'
import { NO_DORMITORY_ID } from '../types/dormitory'
import { kyivNow, addDaysToISODate } from '../utils/kyivTime'
import type { Event } from '../types/event'
import { buildUser, stubAuthLayer, tokenFor } from './helpers'
import type { ApiErrorBody } from './helpers'

/**
 * Картки поширення події. Найважливіше тут — приватність (закриту подію
 * не можна витягти через публічний endpoint) і безпека рендера
 * (екранування, відсутність мережевих завантажень, path traversal).
 */

const DORM_A = '00000000-0000-0000-0000-000000000101'
const EVENT_ID = '00000000-0000-0000-0000-0000000000ee'
const OTHER_EVENT_ID = '00000000-0000-0000-0000-0000000000ff'
const FUTURE_DATE = addDaysToISODate(kyivNow().date, 30)

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    creatorId: '00000000-0000-0000-0000-000000000001',
    title: 'Кіновечір',
    description: '',
    isOnline: true,
    vipOnly: false,
    gpuOnly: false,
    date: FUTURE_DATE,
    time: '19:30:00',
    location: 'Онлайн',
    maxParticipants: 20,
    participantIds: ['00000000-0000-0000-0000-000000000001'],
    createdAt: new Date().toISOString(),
    dormitoryId: DORM_A,
    ...overrides,
  }
}

function stubReads(event: Event) {
  mock.method(eventsRepository, 'findById', async () => event)
  mock.method(usersRepository, 'getPublicUsersByIds', async () => [
    { id: '00000000-0000-0000-0000-000000000001', firstName: 'Тимофій' },
  ])
  mock.method(usersRepository, 'getShareCardUsersByIds', async () => [
    {
      id: '00000000-0000-0000-0000-000000000001',
      telegramId: 100001,
      firstName: 'Тимофій',
    },
  ])
  mock.method(dormitoriesRepository, 'findAll', async () => [
    { id: DORM_A, name: 'Гуртожиток №1', createdAt: new Date().toISOString() },
  ])
}

function cardInput(overrides: Partial<ShareCardInput> = {}): ShareCardInput {
  return {
    eventId: EVENT_ID,
    title: 'Кіновечір',
    date: FUTURE_DATE,
    time: '19:30',
    location: 'Хол',
    isOnline: false,
    participantCount: 3,
    maxParticipants: 20,
    participants: [{ displayName: 'Тимофій' }],
    vipOnly: false,
    gpuOnly: false,
    hideDetails: false,
    hasCover: false,
    ...overrides,
  }
}

describe('share card rendering', () => {
  it('produces a real JPEG of exactly 1200x630 for chat', async () => {
    const buffer = await renderShareCard(cardInput(), 'chat')
    const meta = await sharp(buffer).metadata()

    assert.equal(meta.format, 'jpeg', 'Bot API requires JPEG for InlineQueryResultPhoto')
    assert.equal(meta.width, SHARE_CARD_SIZES.chat.width)
    assert.equal(meta.height, SHARE_CARD_SIZES.chat.height)
  })

  it('produces a real PNG of exactly 1080x1920 for story', async () => {
    const buffer = await renderShareCard(cardInput(), 'story')
    const meta = await sharp(buffer).metadata()

    assert.equal(meta.format, 'png')
    assert.equal(meta.width, SHARE_CARD_SIZES.story.width)
    assert.equal(meta.height, SHARE_CARD_SIZES.story.height)
  })

  it('renders without a cover just fine', async () => {
    for (const format of ['chat', 'story'] as const) {
      const buffer = await renderShareCard(cardInput({ hasCover: false }), format)
      assert.ok(buffer.length > 1000, `${format} card must not be empty`)
    }
  })

  it('never breaks on a very long title', async () => {
    const buffer = await renderShareCard(
      cardInput({ title: 'Дуже '.repeat(200) + 'довга назва події' }),
      'chat',
    )
    const meta = await sharp(buffer).metadata()
    assert.equal(meta.width, SHARE_CARD_SIZES.chat.width)
  })

  it('escapes XML-significant characters instead of injecting SVG nodes', () => {
    assert.equal(escapeXml('<rect/>'), '&lt;rect/&gt;')
    assert.equal(escapeXml('a & b'), 'a &amp; b')
    assert.equal(escapeXml(`"q" 'p'`), '&quot;q&quot; &apos;p&apos;')
  })

  it('still renders when the title and location are SVG injection attempts', async () => {
    const buffer = await renderShareCard(
      cardInput({
        title: '</text><rect width="9999" height="9999" fill="red"/><text>',
        location: '<script>alert(1)</script>',
      }),
      'chat',
    )
    const meta = await sharp(buffer).metadata()
    // Якби екранування не спрацювало, resvg або впав би на розборі, або
    // намалював чужий прямокутник — сюди ми б не дійшли з валідним JPEG.
    assert.equal(meta.format, 'jpeg')
    assert.equal(meta.width, SHARE_CARD_SIZES.chat.width)
  })

  it('renders real Cyrillic glyphs without relying on system fonts', async () => {
    // Однакова довжина рядків навмисна: tofu-квадрати дали б однакове
    // зображення, а вбудований DejaVu має різні контури цих літер.
    const first = await renderShareCard(cardInput({ title: 'АБВГ' }), 'chat')
    const second = await renderShareCard(cardInput({ title: 'ҐЄІЇ' }), 'chat')

    assert.ok(!first.equals(second), 'Cyrillic letters must render as glyphs, not identical boxes')
  })

  it('skips emoji and uses the first real letter for an avatar fallback', () => {
    assert.equal(initialOf('🔥 Тимофій'), 'Т')
    assert.equal(initialOf('🎉 42'), '4')
  })

  it('uses a same-origin template cover as the card background', async () => {
    const relativeDir = join('event-templates', 'share-cover-test')
    await mkdir(join(TEST_UPLOADS_DIR, relativeDir), { recursive: true })
    await writeFile(
      join(TEST_UPLOADS_DIR, relativeDir, 'cover.webp'),
      await sharp({
        create: { width: 800, height: 500, channels: 3, background: '#2563eb' },
      }).webp().toBuffer(),
    )

    const withCover = await renderShareCard(
      cardInput({
        hasCover: true,
        coverImageUrl: `https://backend.test/uploads/${relativeDir}/cover.webp?v=1`,
      }),
      'chat',
    )
    const withoutCover = await renderShareCard(cardInput({ hasCover: false }), 'chat')

    assert.ok(!withCover.equals(withoutCover), 'template cover must affect the rendered background')
  })

  it('downloads avatars only from the bounded Telegram userpic endpoint', async () => {
    const originalFetch = globalThis.fetch
    // Telegram офіційно може повертати photo_url як JPEG або SVG.
    const avatar = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="24" fill="#ef4444"/></svg>'
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return new Response(avatar, { headers: { 'Content-Type': 'image/svg+xml' } })
    }) as typeof fetch

    try {
      const dataUri = await loadParticipantAvatar('https://t.me/i/userpic/320/example.jpg')
      assert.match(dataUri ?? '', /^data:image\/png;base64,/)
      assert.equal(calls, 1)

      assert.equal(await loadParticipantAvatar('https://attacker.example/avatar.jpg'), undefined)
      assert.equal(calls, 1, 'foreign hosts must be rejected before fetch')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('loads the current participant avatar through Telegram Bot API', async () => {
    const originalFetch = globalThis.fetch
    const avatar = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#22c55e' },
    }).jpeg().toBuffer()

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/getUserProfilePhotos')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { total_count: 1, photos: [[{ file_id: 'small' }, { file_id: 'large' }]] },
        }), { headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'photos/avatar.jpg', file_size: avatar.length },
        }), { headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/file/bot')) {
        return new Response(avatar, { headers: { 'Content-Type': 'image/jpeg' } })
      }
      throw new Error(`Unexpected Telegram URL: ${url}`)
    }) as typeof fetch

    try {
      const result = await getTelegramProfilePhoto(100001)
      assert.ok(result?.equals(avatar))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('wraps and truncates long text deterministically', () => {
    assert.deepEqual(wrapText('одне два три', 2, 8), ['одне два', 'три'])
    assert.equal(wrapText('слово', 2, 10).length, 1)
    // Слово, довше за рядок, ріжеться, а не розсуває картку.
    assert.ok(wrapText('a'.repeat(50), 2, 10).every((line) => line.length <= 10))
    assert.equal(truncateLine('a'.repeat(50), 10).length, 10)
    assert.ok(truncateLine('a'.repeat(50), 10).endsWith('…'))
  })

  it('hides every private detail on a locked card', async () => {
    // Порівнюємо байти: закрита картка не повинна залежати від назви
    // події взагалі — інакше вміст протікав би в зображення.
    const first = await renderShareCard(
      cardInput({ hideDetails: true, vipOnly: true, title: 'Секретна назва' }),
      'chat',
    )
    const second = await renderShareCard(
      cardInput({ hideDetails: true, vipOnly: true, title: 'Зовсім інша назва' }),
      'chat',
    )
    assert.ok(first.equals(second), 'a locked card must not depend on the event title')
  })

  it('never loads a cover for a locked card even when one exists', async () => {
    const withCover = await renderShareCard(
      cardInput({ hideDetails: true, vipOnly: true, hasCover: true }),
      'chat',
    )
    const withoutCover = await renderShareCard(
      cardInput({ hideDetails: true, vipOnly: true, hasCover: false }),
      'chat',
    )
    assert.ok(withCover.equals(withoutCover), 'a locked card must ignore the cover')
  })
})

describe('POST /api/events/:id/share-card', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('gives a signed URL for an event the user can see', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubReads(fakeEvent())

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-card`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ format: 'story' })

    assert.equal(res.status, 200)
    assert.match(res.body.url, /\/api\/share-cards\/[0-9a-f-]{36}\.png\?format=story&token=/)
    assert.equal(typeof res.body.expiresIn, 'number')
  })

  it('returns 404 for an event that does not exist', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    mock.method(eventsRepository, 'findById', async () => null)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-card`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({})

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
  })

  it('refuses a VIP event to a user without the VIP role', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubReads(fakeEvent({ vipOnly: true }))

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-card`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({})

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'EVENT_NOT_FOUND')
  })

  it('refuses a GPU event to a user without the GPU role', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user], vips: [user.id] })
    stubReads(fakeEvent({ gpuOnly: true }))

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-card`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({})

    assert.equal(res.status, 404)
  })

  it('refuses an offline event to a user without a dormitory', async () => {
    const user = buildUser({ dormitoryId: NO_DORMITORY_ID })
    stubAuthLayer({ users: [user] })
    stubReads(fakeEvent({ isOnline: false, location: 'Хол' }))

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-card`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({})

    assert.equal(res.status, 404)
  })

  it('rejects unauthenticated callers with 401', async () => {
    const res = await request(app).post(`/api/events/${EVENT_ID}/share-card`).send({})
    assert.equal(res.status, 401)
  })
})

describe('GET /api/share-cards/:file (public, token-gated)', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('serves the image for a valid token', async () => {
    stubReads(fakeEvent())
    const token = signShareToken({ eventId: EVENT_ID, format: 'story', locked: false })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.png`)
      .query({ format: 'story', token })

    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    const meta = await sharp(res.body as Buffer).metadata()
    assert.equal(meta.width, SHARE_CARD_SIZES.story.width)
    assert.equal(meta.height, SHARE_CARD_SIZES.story.height)
  })

  it('serves a JPEG for the chat format', async () => {
    stubReads(fakeEvent())
    const token = signShareToken({ eventId: EVENT_ID, format: 'chat', locked: false })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.jpg`)
      .query({ format: 'chat', token })

    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/jpeg')
    const meta = await sharp(res.body as Buffer).metadata()
    assert.equal(meta.format, 'jpeg')
  })

  it('refuses a request with no token at all', async () => {
    stubReads(fakeEvent())
    const res = await request(app).get(`/api/share-cards/${EVENT_ID}.png`).query({ format: 'story' })
    assert.equal(res.status, 400)
  })

  it('refuses a forged token', async () => {
    stubReads(fakeEvent())
    const valid = signShareToken({ eventId: EVENT_ID, format: 'story', locked: false })
    const [body] = valid.split('.')
    const forged = `${body}.${Buffer.from('not-a-real-signature').toString('base64url')}`

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.png`)
      .query({ format: 'story', token: forged })

    assert.equal(res.status, 404)
    assert.equal((res.body as ApiErrorBody).error.code, 'SHARE_CARD_NOT_FOUND')
  })

  it('refuses a token whose payload was tampered with', async () => {
    stubReads(fakeEvent())
    const valid = signShareToken({ eventId: EVENT_ID, format: 'story', locked: true })
    const [, signature] = valid.split('.')
    // Той самий підпис, але payload перероблений на «не закриту» картку.
    const tamperedBody = Buffer.from(
      JSON.stringify({
        eventId: EVENT_ID,
        format: 'story',
        locked: false,
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      'utf8',
    ).toString('base64url')

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.png`)
      .query({ format: 'story', token: `${tamperedBody}.${signature}` })

    assert.equal(res.status, 404)
  })

  it('refuses an expired token', async () => {
    stubReads(fakeEvent())
    const expired = signShareToken({ eventId: EVENT_ID, format: 'story', locked: false }, -60)

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.png`)
      .query({ format: 'story', token: expired })

    assert.equal(res.status, 404)
  })

  it("refuses another event's token", async () => {
    stubReads(fakeEvent())
    const otherToken = signShareToken({
      eventId: OTHER_EVENT_ID,
      format: 'story',
      locked: false,
    })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.png`)
      .query({ format: 'story', token: otherToken })

    assert.equal(res.status, 404)
  })

  it('refuses a token issued for the other format', async () => {
    stubReads(fakeEvent())
    const chatToken = signShareToken({ eventId: EVENT_ID, format: 'chat', locked: false })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.png`)
      .query({ format: 'story', token: chatToken })

    assert.equal(res.status, 404)
  })

  it('refuses an extension that does not match the requested format', async () => {
    const token = signShareToken({ eventId: EVENT_ID, format: 'story', locked: false })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.jpg`)
      .query({ format: 'story', token })

    assert.equal(res.status, 404)
  })

  it('rejects path traversal in the file segment', async () => {
    const findById = mock.method(eventsRepository, 'findById', async () => fakeEvent())
    const token = signShareToken({ eventId: EVENT_ID, format: 'story', locked: false })

    for (const file of ['../../etc/passwd', '..%2f..%2fetc%2fpasswd', 'not-a-uuid.png']) {
      const res = await request(app)
        .get(`/api/share-cards/${encodeURIComponent(file)}`)
        .query({ format: 'story', token })
      assert.ok(res.status === 400 || res.status === 404, `${file} → ${res.status}`)
    }
    assert.equal(findById.mock.callCount(), 0, 'must never reach the repository')
  })

  it('keeps a locked card locked even if the token says otherwise later', async () => {
    // Подія стала VIP уже після видачі токена — картка все одно закрита.
    stubReads(fakeEvent({ vipOnly: true }))
    const token = signShareToken({ eventId: EVENT_ID, format: 'chat', locked: false })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.jpg`)
      .query({ format: 'chat', token })

    assert.equal(res.status, 200)
    // Та сама картинка, що й для явно закритого токена.
    const lockedToken = signShareToken({ eventId: EVENT_ID, format: 'chat', locked: true })
    const lockedRes = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.jpg`)
      .query({ format: 'chat', token: lockedToken })
    assert.ok((res.body as Buffer).equals(lockedRes.body as Buffer))
  })
})

describe('POST /api/events/:id/share-message', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('returns a controlled 502 when the Bot API fails, instead of a 500', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubReads(fakeEvent())
    globalThis.fetch = (async () => {
      throw new Error('Telegram is down')
    }) as typeof fetch

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-message`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 502)
    assert.equal((res.body as ApiErrorBody).error.code, 'SHARE_MESSAGE_UNAVAILABLE')
  })

  it('checks access before ever calling the Bot API', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubReads(fakeEvent({ vipOnly: true }))

    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('must not be called')
    }) as typeof fetch

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-message`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 404)
    assert.equal(fetchCalls, 0, 'no Bot API call for an inaccessible event')
  })

  it('sends the prepared photo with a JPEG card URL and a join button', async () => {
    const user = buildUser({ dormitoryId: DORM_A })
    stubAuthLayer({ users: [user] })
    stubReads(fakeEvent())

    const calls: { url: string; body: Record<string, unknown> }[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body })
      const method = String(url).split('/').pop()
      if (method === 'getMe') {
        return new Response(JSON.stringify({ ok: true, result: { username: 'dormhub_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ ok: true, result: { id: 'prepared-123', expiration_date: 1893456000 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/share-message`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.preparedMessageId, 'prepared-123')

    const saveCall = calls.find((call) => call.url.endsWith('/savePreparedInlineMessage'))
    assert.ok(saveCall, 'savePreparedInlineMessage must be called')
    assert.equal(saveCall.body.user_id, user.telegramId, 'prepared for the caller only')

    const result = saveCall.body.result as Record<string, unknown>
    assert.equal(result.type, 'photo')
    // Bot API вимагає JPEG для photo_url.
    assert.match(String(result.photo_url), /\.jpg\?format=chat&token=/)
    const markup = result.reply_markup as { inline_keyboard: { text: string; url: string }[][] }
    assert.equal(markup.inline_keyboard[0][0].text, '🎉 Приєднатися')
    // Deep link будується наявним buildEventDeepLink — формат незмінний.
    assert.match(markup.inline_keyboard[0][0].url, /^https:\/\/t\.me\/dormhub_bot.*startapp=event_/)
  })
})

describe('share endpoints never fetch anything external for images', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    mock.restoreAll()
    globalThis.fetch = originalFetch
  })

  it('ignores an attacker-controlled imageUrl instead of downloading it', async () => {
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('the renderer must never make network calls')
    }) as typeof fetch

    // imageUrl вказує на чужий хост — рендер має його повністю
    // проігнорувати й узяти (відсутній) локальний файл.
    stubReads(fakeEvent({ imageUrl: 'http://169.254.169.254/latest/meta-data/' }))
    const token = signShareToken({ eventId: EVENT_ID, format: 'chat', locked: false })

    const res = await request(app)
      .get(`/api/share-cards/${EVENT_ID}.jpg`)
      .query({ format: 'chat', token })

    assert.equal(res.status, 200)
    assert.equal(fetchCalls, 0, 'no SSRF: the backend must not fetch imageUrl')
  })
})
