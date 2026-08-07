import type { Request, Response } from 'express'
import * as adminService from '../services/admin.service'
import { supabase } from '../config/supabase'
import { AppError } from '../utils/AppError'
import { eventIdParamSchema, userIdParamSchema as participantIdParamSchema } from '../validation/event.schemas'
import {
  eventsQuerySchema,
  usersQuerySchema,
  userIdParamSchema,
  addAdminSchema,
  adminUserIdParamSchema,
  banUserSchema,
  eventTemplateIdParamSchema,
  eventTemplateSchema,
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

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const { id } = userIdParamSchema.parse(req.params)
  await adminService.deleteUser(req.user.id, id)
  res.json({ success: true })
}

export async function listBannedUsers(_req: Request, res: Response): Promise<void> {
  res.json({ users: await adminService.listBannedUsers() })
}

export async function banUser(req: Request, res: Response): Promise<void> {
  const { id } = userIdParamSchema.parse(req.params)
  const { duration, until } = banUserSchema.parse(req.body)
  const user = await adminService.banUser(req.user.id, id, duration, until)
  res.json({ user })
}

export async function unbanUser(req: Request, res: Response): Promise<void> {
  const { id } = userIdParamSchema.parse(req.params)
  await adminService.unbanUser(id)
  res.json({ success: true })
}

export async function listEventTemplates(_req: Request, res: Response): Promise<void> {
  res.json({ templates: await adminService.listEventTemplates() })
}

export async function createEventTemplate(req: Request, res: Response): Promise<void> {
  const input = eventTemplateSchema.parse(req.body)
  res.status(201).json({ template: await adminService.createEventTemplate(input) })
}

export async function updateEventTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  const input = eventTemplateSchema.parse(req.body)
  res.json({ template: await adminService.updateEventTemplate(templateId, input) })
}

export async function uploadEventTemplateImage(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'IMAGE_REQUIRED', 'Оберіть фотографію')
  }

  const contentType = req.headers['content-type'] ?? ''
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  const extension = extensions[contentType]
  if (!extension) {
    throw new AppError(415, 'IMAGE_TYPE_UNSUPPORTED', 'Підтримуються JPG, PNG або WebP')
  }

  const path = `templates/${templateId}/cover.${extension}`
  const { error } = await supabase.storage.from('event-images').upload(path, req.body, {
    contentType,
    upsert: true,
  })
  if (error) throw error

  const { data } = supabase.storage.from('event-images').getPublicUrl(path)
  const template = await adminService.updateEventTemplateImage(templateId, data.publicUrl)
  res.json({ template })
}

export async function deleteEventTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  await adminService.deleteEventTemplate(templateId)
  res.json({ success: true })
}

export async function createFromEventTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  const event = await adminService.createEventFromTemplate(
    templateId,
    req.user.id,
    req.user.dormitoryId,
  )
  res.status(201).json({ event })
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
