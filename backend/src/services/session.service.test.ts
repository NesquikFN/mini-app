import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { signSession, verifySession } from './session.service'
import { AppError } from '../utils/AppError'

const SECRET = 'test-jwt-secret-please-ignore'

describe('session.service', () => {
  it('round-trips a signed session token', () => {
    const token = signSession({ sub: 'user-uuid-1', telegramId: 123456789 }, SECRET)
    const payload = verifySession(token, SECRET)

    assert.equal(payload.sub, 'user-uuid-1')
    assert.equal(payload.telegramId, 123456789)
    assert.ok(payload.exp > payload.iat)
  })

  it('rejects a token signed with a different secret', () => {
    const token = signSession({ sub: 'user-uuid-1', telegramId: 1 }, SECRET)

    assert.throws(
      () => verifySession(token, 'a-different-secret'),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_SESSION',
    )
  })

  it('rejects a tampered payload', () => {
    const token = signSession({ sub: 'user-uuid-1', telegramId: 1 }, SECRET)
    const [body, signature] = token.split('.')
    const tamperedBody = Buffer.from(
      JSON.stringify({ sub: 'someone-else', telegramId: 999, iat: 0, exp: 9999999999 }),
    ).toString('base64url')

    assert.throws(
      () => verifySession(`${tamperedBody}.${signature}`, SECRET),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_SESSION',
    )
    assert.ok(body.length > 0)
  })

  it('rejects an expired token', () => {
    const token = signSession({ sub: 'user-uuid-1', telegramId: 1 }, SECRET, -10)

    assert.throws(
      () => verifySession(token, SECRET),
      (error: unknown) => error instanceof AppError && error.code === 'SESSION_EXPIRED',
    )
  })

  it('rejects a malformed token', () => {
    assert.throws(
      () => verifySession('not-a-valid-token', SECRET),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_SESSION',
    )
  })
})
