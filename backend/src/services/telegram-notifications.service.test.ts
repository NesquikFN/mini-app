import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TelegramApiError,
  buildMiniAppDeepLink,
  isTransientTelegramFailure,
} from './telegram-notifications.service'
import { AppError } from '../utils/AppError'

describe('buildMiniAppDeepLink', () => {
  it('includes the short name for a named Direct Mini App', () => {
    assert.equal(
      buildMiniAppDeepLink('DormHubBot', 'event_123', 'dormhub'),
      'https://t.me/DormHubBot/dormhub?startapp=event_123',
    )
  })

  it('uses the Main Mini App link when no short name is configured', () => {
    assert.equal(
      buildMiniAppDeepLink('DormHubBot', 'event_123', ''),
      'https://t.me/DormHubBot?startapp=event_123',
    )
  })
})

/**
 * Від цієї класифікації залежить, чи повторить планувальник нагадування
 * (event-reminders.service.ts) і чи покаже адмін-панель порожній список
 * чатів замість помилки (listAvailableChats).
 */
describe('isTransientTelegramFailure', () => {
  it('вважає тимчасовими 429 і 5xx від Telegram', () => {
    assert.equal(isTransientTelegramFailure(new TelegramApiError(429, 'Too Many Requests')), true)
    assert.equal(isTransientTelegramFailure(new TelegramApiError(500, 'Internal Server Error')), true)
    assert.equal(isTransientTelegramFailure(new TelegramApiError(502, 'Bad Gateway')), true)
  })

  it('вважає остаточними відмови, які повторювати марно', () => {
    // Бот заблокований користувачем або вигнаний із чату.
    assert.equal(
      isTransientTelegramFailure(new TelegramApiError(403, 'Forbidden: bot was blocked by the user')),
      false,
    )
    // Неіснуючий chat_id, зламаний parse_mode тощо.
    assert.equal(isTransientTelegramFailure(new TelegramApiError(400, 'Bad Request: chat not found')), false)
    assert.equal(isTransientTelegramFailure(new TelegramApiError(404, 'Not Found')), false)
  })

  it('не повторює власні помилки застосунку', () => {
    // Поки BOT_TOKEN не заданий, повтори нічого не змінять.
    const notConfigured = new AppError(503, 'BOT_TOKEN_NOT_CONFIGURED', 'Telegram-бот ще не налаштований')
    assert.equal(isTransientTelegramFailure(notConfigured), false)
  })

  it('повторює те, що навіть не дійшло до Telegram', () => {
    // Обрив мережі, DNS, таймаут fetch — доля повідомлення невідома,
    // тож єдина безпечна відповідь «спробувати ще раз».
    assert.equal(isTransientTelegramFailure(new TypeError('fetch failed')), true)
    assert.equal(isTransientTelegramFailure(new Error('socket hang up')), true)
    assert.equal(isTransientTelegramFailure('unexpected'), true)
  })

  it('лишається AppError назовні — формат відповіді API не змінився', () => {
    const error = new TelegramApiError(429, 'Too Many Requests')

    assert.ok(error instanceof AppError)
    assert.equal(error.status, 502)
    assert.equal(error.code, 'TELEGRAM_API_ERROR')
  })
})
