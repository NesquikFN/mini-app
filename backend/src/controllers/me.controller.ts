import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'

export async function getMe(req: Request, res: Response): Promise<void> {
  res.json({ user: req.user })
}

export async function getMyEvents(req: Request, res: Response): Promise<void> {
  res.json(await eventsService.listEventsForUser(req.user.id))
}
