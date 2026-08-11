import type { Request, Response } from 'express'
import { z } from 'zod'
import * as shareService from '../services/event-share.service'
import { AppError } from '../utils/AppError'
import { eventIdParamSchema } from '../validation/event.schemas'
import { uuidParam } from '../validation/common.schemas'
import { SHARE_TOKEN_TTL_SECONDS } from '../services/share-token.service'
import type { ShareCardFormat } from '../utils/shareCard'

const shareFormatSchema = z.object({
  format: z.enum(['chat', 'story']).default('story'),
})

/** Публічний маршрут отримує id у вигляді `<uuid>.<ext>` — розширення
 * потрібне лише щоб Telegram бачив «файл із картинкою» в URL. */
const shareCardParamSchema = z.object({
  file: z
    .string()
    .regex(/^[0-9a-f-]{36}\.(jpg|png)$/i, 'Некоректне посилання на картку'),
})

const shareCardQuerySchema = z.object({
  format: z.enum(['chat', 'story']),
  token: z.string().min(1).max(2048),
})

/**
 * Підписане посилання на картку для Stories. Доступ перевіряється
 * ДО видачі токена — той, хто не бачить події, токена не отримає.
 */
export async function createShareCardUrl(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const { format } = shareFormatSchema.parse(req.body ?? {})

  const context = await shareService.resolveShareContext(id, req.user.id)
  res.json({
    url: shareService.buildShareCardUrl(id, format as ShareCardFormat, context.locked),
    expiresIn: SHARE_TOKEN_TTL_SECONDS,
  })
}

/**
 * Готує inline-повідомлення й повертає його id для
 * WebApp.shareMessage. Помилку Bot API віддаємо контрольованим кодом —
 * frontend за ним переходить на запасний t.me/share/url.
 */
export async function createShareMessage(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const context = await shareService.resolveShareContext(id, req.user.id)

  try {
    const prepared = await shareService.prepareShareMessage(context, req.user.telegramId)
    res.json(prepared)
  } catch (error) {
    // Доступ уже перевірено вище, тож сюди потрапляють лише проблеми
    // самого Bot API (старий клієнт, вимкнений бот, тимчасова помилка).
    console.error(`Не вдалося підготувати повідомлення для події ${id}:`, error)
    throw new AppError(
      502,
      'SHARE_MESSAGE_UNAVAILABLE',
      'Не вдалося підготувати повідомлення. Спробуйте інший спосіб.',
    )
  }
}

/**
 * Публічна (без сесії) видача картинки — її тягне сам Telegram.
 * Єдиний доказ права доступу — підписаний токен у query.
 */
export async function getShareCardImage(req: Request, res: Response): Promise<void> {
  const { file } = shareCardParamSchema.parse(req.params)
  const { format, token } = shareCardQuerySchema.parse(req.query)
  const [rawEventId, extension] = file.split('.')
  // Розширення — частина публічного контракту для Telegram. Не
  // дозволяємо URL виду .jpg?format=story віддавати PNG під хибним ім'ям.
  if ((format === 'chat' && extension !== 'jpg') || (format === 'story' && extension !== 'png')) {
    throw new AppError(404, 'SHARE_CARD_NOT_FOUND', 'Картку не знайдено')
  }
  const eventId = uuidParam('Некоректний ідентифікатор події').parse(rawEventId)

  const context = await shareService.resolveShareContextFromToken(eventId, format, token)
  const image = await shareService.getShareCardImage(context, format)

  res
    .status(200)
    .setHeader('Content-Type', shareService.shareCardContentType(format))
    .setHeader('Content-Length', String(image.length))
    // Картка живе рівно стільки, скільки токен — кешувати її довше немає
    // сенсу, а віддавати назавжди публічно небезпечно.
    .setHeader('Cache-Control', `private, max-age=${SHARE_TOKEN_TTL_SECONDS}`)
    .setHeader('Content-Disposition', 'inline')
    .send(image)
}
