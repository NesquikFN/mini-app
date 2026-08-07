import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import {
  createEventSchema,
  eventIdParamSchema,
  eventsListQuerySchema,
} from '../validation/event.schemas'

export async function listEvents(req: Request, res: Response): Promise<void> {
  const { scope } = eventsListQuerySchema.parse(req.query)
  res.json({ events: await eventsService.listEvents(scope, req.user.dormitoryId) })
}

export async function getEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = await eventsService.getEvent(id)
  const { creator, participants } = await eventsService.getEventMembers(event)
  res.json({ event, creator, participants })
}

export async function createEvent(req: Request, res: Response): Promise<void> {
  const input = createEventSchema.parse(req.body)
  // dormitoryId навмисно НЕ входить у createEventSchema — навіть якщо
  // req.body містить це поле, Zod його відкидає. Реальне значення завжди
  // береться з req.user.dormitoryId (users.dormitory_id поточної сесії).
  const event = await eventsService.createEvent(req.user.id, req.user.dormitoryId, input)
  res.status(201).json({ event })
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
