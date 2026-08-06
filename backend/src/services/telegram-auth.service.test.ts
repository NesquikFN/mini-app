import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateTelegramInitData } from './telegram-auth.service'
import { AppError } from '../utils/AppError'
import { buildValidInitData, nowSeconds, telegramUserField } from '../test-utils/telegramInitData'

const BOT_TOKEN = 'test-bot-token-1234567890'

function defaultUser() {
  return telegramUserField(123456789, 'Тимофій', 'demo_user')
}

describe('validateTelegramInitData', () => {
  it('accepts valid, freshly-signed initData and returns the parsed user', () => {
    const initData = buildValidInitData(
      {
        auth_date: String(nowSeconds()),
        user: defaultUser(),
        query_id: 'AAH_test',
      },
      BOT_TOKEN,
    )

    const result = validateTelegramInitData(initData, BOT_TOKEN)

    assert.equal(result.user.id, 123456789)
    assert.equal(result.user.first_name, 'Тимофій')
    assert.equal(result.user.username, 'demo_user')
  })

  it('rejects initData signed with a different bot token (wrong hash)', () => {
    const initData = buildValidInitData(
      { auth_date: String(nowSeconds()), user: defaultUser() },
      'a-different-bot-token',
    )

    assert.throws(
      () => validateTelegramInitData(initData, BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_HASH',
    )
  })

  it('rejects initData whose user field was tampered with after signing', () => {
    const initData = buildValidInitData(
      {
        auth_date: String(nowSeconds()),
        user: defaultUser(),
      },
      BOT_TOKEN,
    )

    const tampered = initData.replace(
      encodeURIComponent('Тимофій'),
      encodeURIComponent('Не Тимофій'),
    )

    assert.throws(
      () => validateTelegramInitData(tampered, BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_HASH',
    )
  })

  it('rejects initData with an expired auth_date', () => {
    const twoDaysAgo = nowSeconds() - 2 * 24 * 60 * 60
    const initData = buildValidInitData(
      {
        auth_date: String(twoDaysAgo),
        user: defaultUser(),
      },
      BOT_TOKEN,
    )

    assert.throws(
      () => validateTelegramInitData(initData, BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.code === 'EXPIRED_INIT_DATA',
    )
  })

  it('rejects initData with no hash field at all', () => {
    const params = new URLSearchParams({
      auth_date: String(nowSeconds()),
      user: defaultUser(),
    })

    assert.throws(
      () => validateTelegramInitData(params.toString(), BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_INIT_DATA',
    )
  })

  it('rejects malformed initData input', () => {
    assert.throws(
      () => validateTelegramInitData('this is not a query string at all !!!', BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.status === 401,
    )
  })

  it('rejects non-string initData (e.g. undefined or object)', () => {
    assert.throws(
      () => validateTelegramInitData(undefined, BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_INIT_DATA',
    )
    assert.throws(
      () => validateTelegramInitData({ hash: 'x' }, BOT_TOKEN),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_INIT_DATA',
    )
  })

  it('rejects when BOT_TOKEN is not configured on the server', () => {
    const initData = buildValidInitData(
      {
        auth_date: String(nowSeconds()),
        user: defaultUser(),
      },
      BOT_TOKEN,
    )

    assert.throws(
      () => validateTelegramInitData(initData, ''),
      (error: unknown) => error instanceof AppError && error.code === 'BOT_TOKEN_NOT_CONFIGURED',
    )
  })
})
