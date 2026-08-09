import type { Request, Response } from 'express'
import * as registrationService from '../services/registration.service'
import {
  registrationsQuerySchema,
  rejectRegistrationSchema,
  adminUserIdParamSchema,
} from '../validation/admin.schemas'

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, status, search } = registrationsQuerySchema.parse(req.query)
  res.json(await registrationService.listRegistrations(page, limit, status, search))
}

export async function getDetail(req: Request, res: Response): Promise<void> {
  const { userId } = adminUserIdParamSchema.parse(req.params)
  const registration = await registrationService.getRegistrationDetail(userId)
  res.json({ registration })
}

export async function approve(req: Request, res: Response): Promise<void> {
  const { userId } = adminUserIdParamSchema.parse(req.params)
  const registration = await registrationService.approveRegistration(req.user.id, userId)
  res.json({ registration })
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { userId } = adminUserIdParamSchema.parse(req.params)
  const { reason } = rejectRegistrationSchema.parse(req.body ?? {})
  const registration = await registrationService.rejectRegistration(req.user.id, userId, reason)
  res.json({ registration })
}
