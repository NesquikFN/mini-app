import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import type { ShareCardFormat } from '../utils/shareCard'

/**
 * Короткоживучий підписаний токен для публічного отримання картки події.
 *
 * Навіщо взагалі публічний endpoint: картинку тягне не браузер
 * користувача, а сам Telegram — його сервери (photo_url в
 * InlineQueryResultPhoto) або клієнт (media_url у shareToStory). Жоден
 * із них не має нашої сесії, тож звичайний requireTelegramAuth там
 * незастосовний. Замість цього доступ дає токен: без нього endpoint не
 * віддає нічого.
 *
 * КЛЮЧ. Окрема env-змінна не потрібна: ключ виводиться з наявного
 * JWT_SECRET через HMAC із доменним розділювачем. Це стандартна key
 * derivation — підпис картки й підпис сесії роблять різними ключами,
 * тож токен картки неможливо підсунути замість сесійного (і навпаки),
 * навіть якщо формат payload колись збігатиметься.
 */
const SHARE_KEY_DOMAIN = 'dormhub:share-card:v1'

function shareKey(): Buffer {
  return createHmac('sha256', env.JWT_SECRET).update(SHARE_KEY_DOMAIN).digest()
}

export interface ShareTokenPayload {
  /** Подія, і лише вона: токен однієї події не відкриває іншу. */
  eventId: string
  format: ShareCardFormat
  /** Unix-секунди. */
  exp: number
  /** Чи це «закрита» версія картки — входить у підпис, щоб токен на
   * приховану картку не можна було переграти в повну. */
  locked: boolean
}

/** Скільки живе посилання на картку. Достатньо, щоб Telegram устиг її
 * завантажити, і замало, щоб посилання мало сенс пересилати далі. */
export const SHARE_TOKEN_TTL_SECONDS = 15 * 60

export function signShareToken(
  payload: Omit<ShareTokenPayload, 'exp'>,
  ttlSeconds = SHARE_TOKEN_TTL_SECONDS,
): string {
  const full: ShareTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

/**
 * Перевіряє підпис, строк дії та відповідність події/формату з URL.
 * Будь-яка невідповідність — та сама 404, що й для неіснуючої події:
 * підроблений токен не повинен відрізнятись за відповіддю від токена на
 * подію, якої немає.
 */
export function verifyShareToken(
  token: string,
  expected: { eventId: string; format: ShareCardFormat },
): ShareTokenPayload {
  const parts = token.split('.')
  if (parts.length !== 2) throw invalidToken()
  const [body, signature] = parts

  if (!signaturesMatch(signature, sign(body))) throw invalidToken()

  let payload: ShareTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ShareTokenPayload
  } catch {
    throw invalidToken()
  }

  if (
    typeof payload.eventId !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.locked !== 'boolean' ||
    (payload.format !== 'chat' && payload.format !== 'story')
  ) {
    throw invalidToken()
  }

  if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw invalidToken()
  }
  // Токен, виданий на іншу подію або інший формат, тут не спрацює,
  // навіть якщо підпис справжній.
  if (payload.eventId !== expected.eventId || payload.format !== expected.format) {
    throw invalidToken()
  }

  return payload
}

function invalidToken(): AppError {
  return new AppError(404, 'SHARE_CARD_NOT_FOUND', 'Картку не знайдено')
}

function sign(body: string): string {
  return createHmac('sha256', shareKey()).update(body).digest('base64url')
}

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBuf = Buffer.from(received, 'base64url')
  const expectedBuf = Buffer.from(expected, 'base64url')
  if (receivedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(receivedBuf, expectedBuf)
}
