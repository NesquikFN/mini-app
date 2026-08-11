import type { Request, Response } from 'express'
import * as quickPlansService from '../services/quick-plans.service'
import {
  createQuickPlanSchema,
  quickPlanIdParamSchema,
} from '../validation/quick-plan.schemas'

export async function listQuickPlans(req: Request, res: Response): Promise<void> {
  const plans = await quickPlansService.listQuickPlans(req.user.id, req.user.dormitoryId)
  res.json({ plans })
}

export async function createQuickPlan(req: Request, res: Response): Promise<void> {
  const input = createQuickPlanSchema.parse(req.body)
  // creatorId і dormitoryId навмисно НЕ входять у схему: навіть якщо
  // клієнт надішле їх у тілі, Zod їх відкидає. Реальні значення завжди
  // беруться з поточної сесії (req.user).
  const plan = await quickPlansService.createQuickPlan(
    req.user.id,
    req.user.dormitoryId,
    input,
  )
  res.status(201).json({ plan })
}

export async function deleteQuickPlan(req: Request, res: Response): Promise<void> {
  const { id } = quickPlanIdParamSchema.parse(req.params)
  await quickPlansService.deleteOwnQuickPlan(id, req.user.id, req.user.dormitoryId)
  res.json({ success: true })
}

export async function joinQuickPlan(req: Request, res: Response): Promise<void> {
  const { id } = quickPlanIdParamSchema.parse(req.params)
  const plan = await quickPlansService.joinQuickPlan(id, req.user.id, req.user.dormitoryId)
  res.json({ plan })
}

export async function leaveQuickPlan(req: Request, res: Response): Promise<void> {
  const { id } = quickPlanIdParamSchema.parse(req.params)
  const plan = await quickPlansService.leaveQuickPlan(id, req.user.id, req.user.dormitoryId)
  res.json({ plan })
}
