import type { Request, Response } from 'express'
import * as eventRatingsService from '../services/event-ratings.service'
import { eventIdParamSchema } from '../validation/event.schemas'
import { submitEventRatingSchema } from '../validation/event-rating.schemas'

export async function getMyRating(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  res.json(await eventRatingsService.getMyRating(id, req.user.id))
}

export async function submitRating(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const input = submitEventRatingSchema.parse(req.body)
  // userId/organizerId навмисно НЕ походять з тіла запиту — сервіс сам
  // визначає organizerId з event.creatorId, а userId завжди з сесії.
  res.json(await eventRatingsService.submitRating(id, req.user.id, input))
}
