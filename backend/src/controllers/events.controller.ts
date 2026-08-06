import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import { createEventSchema, eventIdParamSchema } from '../validation/event.schemas'

export async function listEvents(_req: Request, res: Response): Promise<void> {
  res.json({ events: await eventsService.listEvents() })
}

export async function getEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  res.json({ event: await eventsService.getEvent(id) })
}

export async function createEvent(req: Request, res: Response): Promise<void> {
  const input = createEventSchema.parse(req.body)
  const event = await eventsService.createEvent(req.user.id, input)
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
