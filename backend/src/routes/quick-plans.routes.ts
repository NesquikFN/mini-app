import { Router } from 'express'
import * as quickPlansController from '../controllers/quick-plans.controller'
import {
  createQuickPlanRateLimiter,
  quickPlanJoinRateLimiter,
} from '../middleware/rateLimit'

export const quickPlansRouter = Router()

quickPlansRouter.get('/', quickPlansController.listQuickPlans)
quickPlansRouter.post('/', createQuickPlanRateLimiter, quickPlansController.createQuickPlan)
quickPlansRouter.delete('/:id', quickPlansController.deleteQuickPlan)
// Кожен join шле DM автору — окремий, суворіший за загальний ліміт.
quickPlansRouter.post('/:id/join', quickPlanJoinRateLimiter, quickPlansController.joinQuickPlan)
quickPlansRouter.delete('/:id/leave', quickPlanJoinRateLimiter, quickPlansController.leaveQuickPlan)
