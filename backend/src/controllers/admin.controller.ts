import type { Request, Response } from 'express'
import * as adminService from '../services/admin.service'
import * as eventsService from '../services/events.service'
import {
  eventIdParamSchema,
  updateEventSchema,
  userIdParamSchema,
} from '../validation/event.schemas'

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.json(await adminService.getStats())
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  res.json({ users: await adminService.listUsers() })
}

export async function getEventDetail(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  res.json(await adminService.getEventDetail(id))
}

export async function updateEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const input = updateEventSchema.parse(req.body)
  const event = await eventsService.updateEvent(id, input)
  res.json({ event })
}

export async function deleteEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  await eventsService.deleteEvent(id)
  res.status(204).end()
}

export async function removeParticipant(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const { userId } = userIdParamSchema.parse(req.params)
  const event = await adminService.removeParticipant(id, userId)
  res.json({ event })
}
