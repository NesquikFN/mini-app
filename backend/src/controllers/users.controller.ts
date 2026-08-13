import type { Request, Response } from 'express'
import * as usersService from '../services/users.service'
import * as organizerReputationService from '../services/organizer-reputation.service'
import { publicUserIdParamSchema } from '../validation/user.schemas'

export async function getPublicProfile(req: Request, res: Response): Promise<void> {
  const { id } = publicUserIdParamSchema.parse(req.params)
  res.json(await usersService.getPublicProfile(id, req.user.id))
}

export async function getOrganizerReputation(req: Request, res: Response): Promise<void> {
  const { id } = publicUserIdParamSchema.parse(req.params)
  res.json(await organizerReputationService.getOrganizerReputation(id))
}
