import type { Request, Response } from 'express'
import * as pollsService from '../services/polls.service'
import {
  audienceQuerySchema,
  createPollSchema,
  pollBroadcastSchema,
  pollIdParamSchema,
  updatePollSchema,
} from '../validation/poll.schemas'

export async function listPolls(_req: Request, res: Response): Promise<void> {
  res.json({ polls: await pollsService.listPollsForAdmin() })
}

export async function createPoll(req: Request, res: Response): Promise<void> {
  const input = createPollSchema.parse(req.body)
  const poll = await pollsService.createPoll(req.user.id, input)
  res.status(201).json({ poll })
}

export async function updatePoll(req: Request, res: Response): Promise<void> {
  const { id } = pollIdParamSchema.parse(req.params)
  const input = updatePollSchema.parse(req.body)
  const poll = await pollsService.updatePoll(id, input)
  res.json({ poll })
}

export async function publishPoll(req: Request, res: Response): Promise<void> {
  const { id } = pollIdParamSchema.parse(req.params)
  const poll = await pollsService.publishPoll(id)
  res.json({ poll })
}

export async function finishPoll(req: Request, res: Response): Promise<void> {
  const { id } = pollIdParamSchema.parse(req.params)
  const poll = await pollsService.finishPoll(id)
  res.json({ poll })
}

export async function deletePoll(req: Request, res: Response): Promise<void> {
  const { id } = pollIdParamSchema.parse(req.params)
  await pollsService.deletePoll(id)
  res.json({ success: true })
}

export async function getAudienceCount(req: Request, res: Response): Promise<void> {
  pollIdParamSchema.parse(req.params)
  const { audience } = audienceQuerySchema.parse(req.query)
  const count = await pollsService.getAudienceCount(audience)
  res.json({ audience, count })
}

export async function broadcastPoll(req: Request, res: Response): Promise<void> {
  const { id } = pollIdParamSchema.parse(req.params)
  const { audience, resend } = pollBroadcastSchema.parse(req.body)
  // confirm перевіряється й відкидається схемою (z.literal(true)) —
  // backend сам вирішує, хто одержувачі, тіло запиту лише обирає
  // аудиторію й підтверджує намір.
  const report = await pollsService.broadcastPoll(id, req.user.id, audience, resend)
  res.json(report)
}
