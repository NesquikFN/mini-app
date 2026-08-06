import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'

export function getMe(req: Request, res: Response): void {
  res.json({ user: req.user })
}

export function getMyEvents(req: Request, res: Response): void {
  res.json(eventsService.listEventsForUser(req.user.id))
}
