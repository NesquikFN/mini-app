import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import { createEventSchema, eventIdParamSchema } from '../validation/event.schemas'

export function listEvents(_req: Request, res: Response): void {
  res.json({ events: eventsService.listEvents() })
}

export function getEvent(req: Request, res: Response): void {
  const { id } = eventIdParamSchema.parse(req.params)
  res.json({ event: eventsService.getEvent(id) })
}

export function createEvent(req: Request, res: Response): void {
  const input = createEventSchema.parse(req.body)
  const event = eventsService.createEvent(req.user.id, input)
  res.status(201).json({ event })
}

export function joinEvent(req: Request, res: Response): void {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = eventsService.joinEvent(id, req.user.id)
  res.json({ event })
}

export function leaveEvent(req: Request, res: Response): void {
  const { id } = eventIdParamSchema.parse(req.params)
  const event = eventsService.leaveEvent(id, req.user.id)
  res.json({ event })
}
