import type { Request, Response } from 'express'
import * as adminService from '../services/admin.service'
import { AppError } from '../utils/AppError'
import { eventIdParamSchema, userIdParamSchema as participantIdParamSchema } from '../validation/event.schemas'
import {
  eventsQuerySchema,
  usersQuerySchema,
  userIdParamSchema,
  addAdminSchema,
  adminUserIdParamSchema,
  banUserSchema,
  notificationSettingsSchema,
} from '../validation/admin.schemas'
import { settingsRepository } from '../repositories/settings.repository'
import * as telegramNotifications from '../services/telegram-notifications.service'

/** Досяжний лише якщо requireTelegramAuth + requireAdmin уже пропустили
 * запит — сама наявність відповіді 200 тут і є перевіркою. */
export async function check(_req: Request, res: Response): Promise<void> {
  res.json({ isAdmin: true })
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.json(await adminService.getStats())
}

export async function getNotificationSettings(_req: Request, res: Response): Promise<void> {
  res.json(await settingsRepository.getNotificationSettings())
}

export async function listNotificationChats(req: Request, res: Response): Promise<void> {
  res.json({ chats: await telegramNotifications.listAvailableChats(req.user.telegramId) })
}

export async function listNotificationTopics(req: Request, res: Response): Promise<void> {
  const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : ''
  if (!/^-?\d+$/.test(chatId)) throw new AppError(400, 'VALIDATION_ERROR', 'Некоректний chat_id')
  res.json({ topics: await telegramNotifications.listAvailableTopics(chatId) })
}

export async function updateNotificationSettings(req: Request, res: Response): Promise<void> {
  const { chatId, chatTitle, threadId, threadTitle } = notificationSettingsSchema.parse(req.body)
  if (chatId) {
    const allowed = (await telegramNotifications.listAvailableChats(req.user.telegramId))
      .some((chat) => chat.id === chatId && chat.title === chatTitle)
    if (!allowed) throw new AppError(403, 'TELEGRAM_CHAT_FORBIDDEN', 'Цей чат недоступний')

    // Not re-validated against listAvailableTopics here (unlike the chat
    // above): topic discovery only has getUpdates() to go on, which has
    // no persistence guarantee — a topic already shown to the admin can
    // fall out of that window by the time they hit Save on a busy chat,
    // producing a false "unavailable" even though the topic still exists.
    // A bogus message_thread_id just fails the announcement later with a
    // clear error (see events.service.announceEvent), so trusting the
    // already-chat-scoped value here is safe.
  }
  res.json(await settingsRepository.setNotificationChat(
    chatId ?? undefined,
    chatTitle ?? undefined,
    threadId ?? undefined,
    threadTitle ?? undefined,
  ))
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

export async function listHosts(_req: Request, res: Response): Promise<void> {
  res.json({ hosts: await adminService.listHosts() })
}

export async function addHost(req: Request, res: Response): Promise<void> {
  const { telegramId } = addAdminSchema.parse(req.body)
  const host = await adminService.addHostByTelegramId(telegramId)
  res.status(201).json({ host })
}

export async function removeHost(req: Request, res: Response): Promise<void> {
  const { userId } = adminUserIdParamSchema.parse(req.params)
  await adminService.removeHost(userId)
  res.json({ success: true })
}
