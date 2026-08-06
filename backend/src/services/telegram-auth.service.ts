import { createHmac, timingSafeEqual } from 'node:crypto'
import { AppError } from '../utils/AppError'
import type { TelegramInitData, TelegramUser } from '../types/telegram'

/**
 * Validates Telegram Mini App `initData` per the official algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret_key   = HMAC_SHA256(key="WebAppData", data=bot_token)
 * expected_hash = HMAC_SHA256(key=secret_key, data=data_check_string) [hex]
 *
 * Implemented with node:crypto only — the algorithm is a handful of lines
 * and a hand-rolled version is easier to audit than pulling in a package
 * that wraps the exact same three HMAC calls.
 */

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60
const CLOCK_SKEW_TOLERANCE_SECONDS = 60

export function validateTelegramInitData(
  initData: unknown,
  botToken: string,
): TelegramInitData {
  if (typeof initData !== 'string' || initData.length === 0) {
    throw new AppError(401, 'INVALID_INIT_DATA', 'initData відсутній або має неправильний тип')
  }

  if (!botToken) {
    throw new AppError(
      500,
      'BOT_TOKEN_NOT_CONFIGURED',
      'BOT_TOKEN не налаштований на сервері',
    )
  }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    throw new AppError(401, 'INVALID_INIT_DATA', 'initData має некоректний формат')
  }

  const hash = params.get('hash')
  if (!hash) {
    throw new AppError(401, 'INVALID_INIT_DATA', 'initData не містить hash')
  }
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (!hashesMatch(computedHash, hash)) {
    throw new AppError(401, 'INVALID_HASH', 'Недійсний підпис initData')
  }

  const authDateRaw = params.get('auth_date')
  const authDate = authDateRaw ? Number(authDateRaw) : NaN
  if (!authDateRaw || Number.isNaN(authDate)) {
    throw new AppError(401, 'INVALID_INIT_DATA', 'initData не містить auth_date')
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate
  if (ageSeconds > MAX_INIT_DATA_AGE_SECONDS || ageSeconds < -CLOCK_SKEW_TOLERANCE_SECONDS) {
    throw new AppError(401, 'EXPIRED_INIT_DATA', 'initData застаріла, відкрийте Mini App ще раз')
  }

  const userRaw = params.get('user')
  if (!userRaw) {
    throw new AppError(401, 'INVALID_INIT_DATA', 'initData не містить дані користувача')
  }

  const user = parseTelegramUser(userRaw)

  return { user, authDate }
}

function hashesMatch(computedHex: string, receivedHex: string): boolean {
  const computed = Buffer.from(computedHex, 'hex')
  const received = Buffer.from(receivedHex, 'hex')
  if (computed.length !== received.length) return false
  return timingSafeEqual(computed, received)
}

function parseTelegramUser(userJson: string): TelegramUser {
  let raw: unknown
  try {
    raw = JSON.parse(userJson)
  } catch {
    throw new AppError(401, 'INVALID_INIT_DATA', 'Не вдалося розібрати дані користувача')
  }

  if (
    typeof raw !== 'object' ||
    raw === null ||
    typeof (raw as Record<string, unknown>).id !== 'number' ||
    typeof (raw as Record<string, unknown>).first_name !== 'string'
  ) {
    throw new AppError(401, 'INVALID_INIT_DATA', 'Некоректні дані користувача в initData')
  }

  const candidate = raw as Record<string, unknown>

  return {
    id: candidate.id as number,
    first_name: candidate.first_name as string,
    last_name: typeof candidate.last_name === 'string' ? candidate.last_name : undefined,
    username: typeof candidate.username === 'string' ? candidate.username : undefined,
    language_code:
      typeof candidate.language_code === 'string' ? candidate.language_code : undefined,
    photo_url: typeof candidate.photo_url === 'string' ? candidate.photo_url : undefined,
  }
}
