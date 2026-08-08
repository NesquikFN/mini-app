import type { Request, Response } from 'express'
import * as usersService from '../services/users.service'
import { publicUserIdParamSchema } from '../validation/user.schemas'

export async function getPublicProfile(req: Request, res: Response): Promise<void> {
  const { id } = publicUserIdParamSchema.parse(req.params)
  res.json(await usersService.getPublicProfile(id))
}
