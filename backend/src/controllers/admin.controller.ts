import type { Request, Response } from 'express'
import * as adminService from '../services/admin.service'
import { eventIdParamSchema, userIdParamSchema as participantIdParamSchema } from '../validation/event.schemas'
import {
  eventsQuerySchema,
  usersQuerySchema,
  userIdParamSchema,
  addAdminSchema,
  adminUserIdParamSchema,
} from '../validation/admin.schemas'

/** Досяжний лише якщо requireTelegramAuth + requireAdmin уже пропустили
 * запит — сама наявність відповіді 200 тут і є перевіркою. */
export async function check(_req: Request, res: Response): Promise<void> {
  res.json({ isAdmin: true })
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.json(await adminService.getStats())
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page, limit, search } = usersQuerySchema.parse(req.query)
  res.json(await adminService.listUsers(page, limit, search))
}

export async function getUserDetail(req: Request, res: Response): Promise<void> {
  const { id } = userIdParamSchema.parse(req.params)
  res.json(await adminService.getUserDetail(id))
}

export async function listEvents(req: Request, res: Response): Promise<void> {
  const { page, limit, search, date } = eventsQuerySchema.parse(req.query)
  res.json(await adminService.listEvents(page, limit, search, date))
}

export async function getEventDetail(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  res.json(await adminService.getEventDetail(id))
}

export async function getEventParticipants(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const { participants } = await adminService.getEventDetail(id)
  res.json({ participants })
}

export async function deleteEvent(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  await adminService.deleteEvent(id)
  res.json({ success: true })
}

export async function removeParticipant(req: Request, res: Response): Promise<void> {
  const { id } = eventIdParamSchema.parse(req.params)
  const { userId } = participantIdParamSchema.parse(req.params)
  await adminService.removeParticipant(id, userId)
  res.json({ success: true })
}

export async function listAdmins(_req: Request, res: Response): Promise<void> {
  res.json({ admins: await adminService.listAdmins() })
}

export async function addAdmin(req: Request, res: Response): Promise<void> {
  const { telegramId } = addAdminSchema.parse(req.body)
  const admin = await adminService.addAdminByTelegramId(telegramId)
  res.status(201).json({ admin })
}

export async function removeAdmin(req: Request, res: Response): Promise<void> {
  const { userId } = adminUserIdParamSchema.parse(req.params)
  await adminService.removeAdmin(userId)
  res.json({ success: true })
}
