import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import * as usersService from '../services/users.service'
import * as registrationService from '../services/registration.service'
import { updateMeSchema, submitRegistrationSchema } from '../validation/user.schemas'

export async function getMe(req: Request, res: Response): Promise<void> {
  res.json({ user: req.user })
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const input = updateMeSchema.parse(req.body)
  let user = req.user
  if (input.dormitoryId !== undefined) {
    user = await usersService.updateDormitory(user.id, input.dormitoryId)
  }
  if (input.notifyNewEvents !== undefined) {
    user = await usersService.updateNotifyNewEvents(user.id, input.notifyNewEvents)
  }
  if (
    input.nickname !== undefined ||
    input.instagram !== undefined ||
    input.bio !== undefined ||
    input.age !== undefined
  ) {
    user = await usersService.updateProfile(user.id, {
      nickname: input.nickname,
      instagram: input.instagram,
      bio: input.bio,
      age: input.age,
    })
  }
  res.json({ user })
}

export async function getMyEvents(req: Request, res: Response): Promise<void> {
  res.json(await eventsService.listEventsForUser(req.user.id))
}

export async function submitRegistration(req: Request, res: Response): Promise<void> {
  const input = submitRegistrationSchema.parse(req.body)
  const user = await registrationService.submitRegistration(req.user.id, input)
  res.json({ user })
}
