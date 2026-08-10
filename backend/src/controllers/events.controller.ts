import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import {
  createEventSchema,
  eventIdParamSchema,
  eventsListQuerySchema,
  updateEventSchema,
  userIdParamSchema,
} from '../validation/event.schemas'
import { processAndStoreImage } from '../utils/uploads'
import { AppError } from '../utils/AppError'

export async function listEvents(req: Request, res: Response): Promise<void> {
  const { scope } = eventsListQuerySchema.parse(req.query)
  res.json({ events: await eventsService.listEvents(scope, req.user.dormitoryId, req.user.id) })
}

export async function getEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = await eventsService.getEvent(id, req.user.id)
  const { creator, participants } = await eventsService.getEventMembers(event)
  res.json({ event, creator, participants })
}

export async function getEventShareLink(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  res.json({ url: await eventsService.getEventShareLink(id, req.user.id) })
}

export async function createEvent(req: Request, res: Response): Promise<void> {
  const input = createEventSchema.parse(req.body)
  // dormitoryId навмисно НЕ входить у createEventSchema — навіть якщо
  // req.body містить це поле, Zod його відкидає. Реальне значення завжди
  // береться з req.user.dormitoryId (users.dormitory_id поточної сесії).
  const event = await eventsService.createEvent(req.user.id, req.user.dormitoryId, input)
  res.status(201).json({ event })
}

export async function updateEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const input = updateEventSchema.parse(req.body)
  const event = await eventsService.updateOwnEvent(id, req.user.id, input)
  res.json({ event })
}

export async function deleteEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  await eventsService.deleteOwnEvent(id, req.user.id)
  res.json({ success: true })
}

export async function removeParticipant(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const { userId } = userIdParamSchema.parse(req.params)
  const event = await eventsService.removeOwnEventParticipant(id, req.user.id, userId)
  res.json({ event })
}

export async function uploadEventImage(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = await eventsService.getEvent(id, req.user.id)
  if (event.creatorId !== req.user.id) {
    throw new AppError(403, 'EVENT_IMAGE_FORBIDDEN', 'Фото може змінювати лише автор події')
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'IMAGE_REQUIRED', 'Оберіть фотографію')
  }

  // Перевірка сигнатури, нормалізація й видалення EXIF — усередині
  // processAndStoreImage. Ім'я файлу повністю серверне (id події вже
  // провалідований як UUID), клієнт на шлях не впливає.
  const imageUrl = await processAndStoreImage(id, req.body, req.headers['content-type'] ?? '')
  const updated = await eventsService.updateEvent(id, { imageUrl })
  if (req.query.announce === 'true') {
    await eventsService.announceEvent(updated)
  }
  res.json({ event: updated })
}

export async function joinEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = await eventsService.joinEvent(id, req.user.id)
  res.json({ event })
}

export async function leaveEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = await eventsService.leaveEvent(id, req.user.id)
  res.json({ event })
}
