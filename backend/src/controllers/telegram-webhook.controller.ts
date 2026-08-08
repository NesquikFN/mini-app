import type { Request, Response } from 'express'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import { handleTelegramWebhookUpdate, type TelegramWebhookUpdate } from '../services/telegram-notifications.service'

/**
 * Telegram calls this directly (not through requireTelegramAuth — there's
 * no Mini App initData here, just Telegram's own server). The secret
 * token header is the only thing stopping a stranger from posting fake
 * updates; see setWebhook's secret_token param.
 */
export async function receiveUpdate(req: Request, res: Response): Promise<void> {
  const receivedSecret = req.header('X-Telegram-Bot-Api-Secret-Token')
  if (!env.TELEGRAM_WEBHOOK_SECRET || receivedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    throw new AppError(401, 'INVALID_WEBHOOK_SECRET', 'Недійсний секрет вебхука')
  }

  // Telegram only cares about a 200 response; it retries on anything
  // else. Errors here shouldn't turn into retry storms for what's just
  // best-effort chat/topic bookkeeping.
  try {
    await handleTelegramWebhookUpdate(req.body as TelegramWebhookUpdate)
  } catch (error) {
    console.error('Не вдалося обробити Telegram webhook update:', error)
  }
  res.status(200).json({ ok: true })
}
