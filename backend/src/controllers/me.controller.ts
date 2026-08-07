import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import * as usersService from '../services/users.service'
import { updateMeSchema } from '../validation/user.schemas'

export async function getMe(req: Request, res: Response): Promise<void> {
  res.json({ user: req.user })
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const input = updateMeSchema.parse(req.body)
  const user = await usersService.updateDormitory(req.user.id, input.dormitoryId)
  res.json({ user })
}

export async function getMyEvents(req: Request, res: Response): Promise<void> {
  res.json(await eventsService.listEventsForUser(req.user.id))
}
