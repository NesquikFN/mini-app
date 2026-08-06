import { createHmac, timingSafeEqual } from 'node:crypto'
import { AppError } from '../utils/AppError'

/**
 * Minimal signed, expiring session token — functionally a JWT (HMAC-signed
 * payload + expiry) without pulling in a JWT library for a two-field
 * payload. Format: base64url(payload).base64url(hmac-sha256(payload)).
 */

export interface SessionPayload {
  sub: string
  telegramId: number
  iat: number
  exp: number
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60

export function signSession(
  payload: Pick<SessionPayload, 'sub' | 'telegramId'>,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const iat = Math.floor(Date.now() / 1000)
  const full: SessionPayload = { ...payload, iat, exp: iat + ttlSeconds }
  const body = base64UrlEncode(JSON.stringify(full))
  const signature = sign(body, secret)
  return `${body}.${signature}`
}

export function verifySession(token: string, secret: string): SessionPayload {
  const parts = token.split('.')
  if (parts.length !== 2) {
    throw new AppError(401, 'INVALID_SESSION', 'Недійсна сесія')
  }
  const [body, signature] = parts

  const expectedSignature = sign(body, secret)
  if (!signaturesMatch(signature, expectedSignature)) {
    throw new AppError(401, 'INVALID_SESSION', 'Недійсна сесія')
  }

  let payload: SessionPayload
  try {
    payload = JSON.parse(base64UrlDecode(body)) as SessionPayload
  } catch {
    throw new AppError(401, 'INVALID_SESSION', 'Недійсна сесія')
  }

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.telegramId !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new AppError(401, 'INVALID_SESSION', 'Недійсна сесія')
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError(401, 'SESSION_EXPIRED', 'Сесія застаріла, увійдіть ще раз')
  }

  return payload
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBuf = Buffer.from(received, 'base64url')
  const expectedBuf = Buffer.from(expected, 'base64url')
  if (receivedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(receivedBuf, expectedBuf)
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}
