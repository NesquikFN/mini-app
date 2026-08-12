import type { Request, Response } from 'express'
import * as pollsService from '../services/polls.service'
import { pollIdParamSchema, voteSchema } from '../validation/poll.schemas'

export async function getActivePoll(req: Request, res: Response): Promise<void> {
  const poll = await pollsService.getActivePollForViewer(req.user.id)
  res.json({ poll })
}

export async function vote(req: Request, res: Response): Promise<void> {
  const { id } = pollIdParamSchema.parse(req.params)
  const { optionId } = voteSchema.parse(req.body)
  // userId завжди із сесії (req.user.id), НІКОЛИ з тіла запиту — той
  // самий підхід, що й у quick-plans.controller.
  const poll = await pollsService.votePoll(id, optionId, req.user.id)
  res.json({ poll })
}
