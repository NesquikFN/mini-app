import { adminRepository } from '../repositories/admin.repository'
import { hostsRepository } from '../repositories/hosts.repository'
import { vipsRepository } from '../repositories/vips.repository'
import { gpusRepository } from '../repositories/gpus.repository'
import { usersRepository } from '../repositories/users.repository'
import { eventsRepository, type EventDateFilter } from '../repositories/events.repository'
import * as eventsService from './events.service'
import { AppError } from '../utils/AppError'
import type { AdminUserView } from '../types/user'
import type {
  AdminStats,
  AdminUserListItem,
  AdminUsersResponse,
  AdminUserDetail,
  AdminEventListItem,
  AdminEventsResponse,
  AdminEventDetail,
  AdminListItem,
  HostListItem,
  VipListItem,
  GpuListItem,
  Pagination,
} from '../types/admin'

function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
}

export async function getStats(): Promise<AdminStats> {
  const [users, registeredUsers, events, activeEvents, participants] = await Promise.all([
    adminRepository.countUsers(),
    adminRepository.countRegisteredUsers(),
    adminRepository.countEvents(),
    adminRepository.countUpcomingEvents(),
    adminRepository.countParticipations(),
  ])

  return { users, registeredUsers, events, activeEvents, participants }
}

export async function listUsers(
  page: number,
  limit: number,
  search?: string,
): Promise<AdminUsersResponse> {
  const { users, total } = await usersRepository.getUsersPaginated(page, limit, search)
  const eventCounts = await adminRepository.countEventsByCreatorIds(users.map((user) => user.id))

  const items: AdminUserListItem[] = users.map((user) => ({
    ...user,
    eventsCreatedCount: eventCounts.get(user.id) ?? 0,
  }))

  return { users: items, pagination: buildPagination(page, limit, total) }
}

export async function getUserDetail(id: string): Promise<AdminUserDetail> {
  const user = await usersRepository.getAdminUserById(id)
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  const { created, participating } = await eventsService.listEventsForUser(id, id, true)

  return {
    user,
    stats: {
      createdEvents: created.length,
      participatingEvents: participating.length,
    },
    createdEvents: created,
    participatingEvents: participating,
  }
}

export async function deleteUser(actorId: string, userId: string): Promise<void> {
  if (actorId === userId) {
    throw new AppError(409, 'CANNOT_DELETE_SELF', 'Не можна видалити власний акаунт')
  }

  const user = await usersRepository.getAdminUserById(userId)
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  if (await adminRepository.isAdmin(userId)) {
    const totalAdmins = await adminRepository.countAdmins()
    if (!canRemoveAdmin(totalAdmins)) {
      throw new AppError(
        409,
        'LAST_ADMIN_CANNOT_BE_REMOVED',
        'Не можна видалити останнього адміністратора',
      )
    }
  }

  // Події, де він був учасником, треба знати ДО видалення: після нього
  // рядки event_participants зникнуть каскадом, і дізнатись, у яких
  // подіях звільнилось місце, вже не буде звідки.
  const affectedEventIds = await eventsRepository.findEventIdsWithParticipant(userId)

  // events.creator_id intentionally uses RESTRICT, so delete authored
  // events first. Their participants are removed by the DB cascade;
  // the user's remaining participations and admin marker cascade when
  // the users row is deleted.
  await eventsRepository.removeByCreatorId(userId)
  const removed = await usersRepository.remove(userId)
  if (!removed) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  // Події, які він створював, уже видалені — promoteWaitlist для них
  // просто нічого не знайде й тихо вийде.
  for (const eventId of affectedEventIds) {
    await eventsService.promoteWaitlist(eventId)
  }
}

export type BanDuration = 'week' | 'forever' | 'custom'

export async function banUser(
  actorId: string,
  userId: string,
  duration: BanDuration,
  customUntil?: string,
): Promise<AdminUserView> {
  if (actorId === userId) {
    throw new AppError(409, 'CANNOT_BAN_SELF', 'Не можна заблокувати власний акаунт')
  }

  const user = await usersRepository.getAdminUserById(userId)
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  if (await adminRepository.isAdmin(userId)) {
    const totalAdmins = await adminRepository.countAdmins()
    if (!canRemoveAdmin(totalAdmins)) {
      throw new AppError(
        409,
        'LAST_ADMIN_CANNOT_BE_BANNED',
        'Не можна заблокувати останнього адміністратора',
      )
    }
  }

  const bannedPermanently = duration === 'forever'
  const bannedUntil =
    duration === 'week'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : duration === 'custom'
        ? customUntil ?? null
        : null

  await usersRepository.ban(userId, bannedUntil, bannedPermanently)
  const updated = await usersRepository.getAdminUserById(userId)
  if (!updated) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  return updated
}

export async function listBannedUsers(): Promise<AdminUserView[]> {
  return usersRepository.getBannedUsers()
}

export async function unbanUser(userId: string): Promise<void> {
  const user = await usersRepository.getAdminUserById(userId)
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  await usersRepository.unban(userId)
}

export async function listEvents(
  page: number,
  limit: number,
  search?: string,
  dateFilter: EventDateFilter = 'all',
): Promise<AdminEventsResponse> {
  const { events, total } = await eventsRepository.findPaginated(page, limit, search, dateFilter)

  const creatorIds = Array.from(new Set(events.map((event) => event.creatorId)))
  const creators = await usersRepository.getPublicUsersByIds(creatorIds)
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]))

  const items: AdminEventListItem[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.time,
    location: event.location,
    maxParticipants: event.maxParticipants,
    participantsCount: event.participantIds.length,
    creator: creatorById.get(event.creatorId) ?? {
      id: event.creatorId,
      firstName: 'Учасник DormHub',
    },
    createdAt: event.createdAt,
  }))

  return { events: items, pagination: buildPagination(page, limit, total) }
}

export async function getEventDetail(id: string): Promise<AdminEventDetail> {
  const event = await eventsService.getEvent(id)
  const { creator, participants } = await eventsService.getEventMembers(event)
  return { event, creator, participants }
}

export async function deleteEvent(id: string): Promise<void> {
  await eventsService.deleteEvent(id)
}

/** Адмін знімає довільного користувача з довільної події. Перевіряємо
 * існування події окремо (getEvent кине 404 EVENT_NOT_FOUND), а вже потім
 * питаємо репозиторій прибрати конкретний рядок участі — якщо його не
 * було, це 404 PARTICIPANT_NOT_FOUND, а не мовчазний "успіх".
 *
 * Організатора не можна зняти цією кнопкою: він завжди в
 * event_participants (автоприєднання при створенні), але видалення
 * організатора — окрема операція (видалення/передача самої події), яку
 * зараз не реалізовано. */
export async function removeParticipant(eventId: string, userId: string): Promise<void> {
  const event = await eventsService.getEvent(eventId)

  if (event.creatorId === userId) {
    throw new AppError(
      400,
      'CANNOT_REMOVE_ORGANIZER',
      'Не можна видалити організатора як учасника — це окрема операція',
    )
  }

  const removed = await eventsRepository.removeParticipant(eventId, userId)
  if (!removed) {
    throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Учасника не знайдено')
  }
  // Місце звільнилось — той самий шлях просування черги, що й після
  // звичайного виходу учасника.
  await eventsService.promoteWaitlist(eventId)
}

/** Список адмінів — деталі профілю домальовуються батчем через
 * usersRepository.getUsersByIds (той самий патерн, що й для creators у
 * listEvents), a не по одному запиту на людину. */
export async function listAdmins(): Promise<AdminListItem[]> {
  const adminRows = await adminRepository.listAdmins()
  if (adminRows.length === 0) return []

  const users = await usersRepository.getUsersByIds(adminRows.map((row) => row.userId))
  const userById = new Map(users.map((user) => [user.id, user]))

  return adminRows
    .map((row) => {
      const user = userById.get(row.userId)
      if (!user) return null
      return { ...user, adminSince: row.adminSince }
    })
    .filter((item): item is AdminListItem => item !== null)
}

/** Додавання адміна відбувається через Telegram ID, а не через users.id —
 * зручніше для оператора (той самий ID, що видно в Telegram), і не
 * дозволяє призначити адміном рядок, якого ще нема (людина повинна хоч
 * раз відкрити застосунок і пройти Telegram-автентифікацію). Upsert у
 * репозиторії гарантує відсутність дублікатів при повторному виклику. */
export async function addAdminByTelegramId(telegramId: number): Promise<AdminListItem> {
  const user = await usersRepository.getUserByTelegramId(telegramId)
  if (!user) {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      'Користувача з таким Telegram ID ще немає в системі — попросіть спочатку відкрити застосунок',
    )
  }

  const adminRow = await adminRepository.addAdmin(user.id)
  const adminView = await usersRepository.getAdminUserById(user.id)
  if (!adminView) {
    throw new Error('Не вдалося прочитати щойно доданого адміністратора')
  }

  return { ...adminView, adminSince: adminRow.adminSince }
}

/**
 * Аналіз поточної моделі: admin_users — плаский список без поняття
 * "головного"/системного адміна (жодного окремого прапорця чи ролі).
 * Мінімальний безпечний варіант захисту без зміни схеми: заборонити
 * видаляти останнього адміна, що лишився — інакше ніхто більше не зможе
 * керувати admin_users і сама адмін-панель стане недосяжною.
 *
 * Винесено в чисту функцію (без звернень до Supabase) навмисно — щоб цю
 * межову умову можна було юніт-тестувати (admin.service.test.ts) не
 * чіпаючи реальний admin_users у живій базі (там зараз справжні
 * адміністратори, включно з обліковим записом власника проєкту).
 */
export function canRemoveAdmin(totalAdminCount: number): boolean {
  return totalAdminCount > 1
}

export async function removeAdmin(userId: string): Promise<void> {
  const isTargetAdmin = await adminRepository.isAdmin(userId)
  if (!isTargetAdmin) {
    throw new AppError(404, 'ADMIN_NOT_FOUND', 'Цей користувач не є адміністратором')
  }

  const total = await adminRepository.countAdmins()
  if (!canRemoveAdmin(total)) {
    throw new AppError(
      409,
      'LAST_ADMIN_CANNOT_BE_REMOVED',
      'Не можна видалити останнього адміністратора',
    )
  }

  await adminRepository.removeAdmin(userId)
}

/** Той самий патерн, що й для listAdmins/addAdminByTelegramId/removeAdmin
 * вище — "хост" не потребує захисту "останнього" (адміни завжди можуть
 * керувати hosts незалежно від їх кількості, на відміну від admin_users,
 * де порожній список означає втрату доступу до самої адмінки). */
export async function listHosts(): Promise<HostListItem[]> {
  const hostRows = await hostsRepository.listHosts()
  if (hostRows.length === 0) return []

  const users = await usersRepository.getUsersByIds(hostRows.map((row) => row.userId))
  const userById = new Map(users.map((user) => [user.id, user]))

  return hostRows
    .map((row) => {
      const user = userById.get(row.userId)
      if (!user) return null
      return { ...user, hostSince: row.hostSince }
    })
    .filter((item): item is HostListItem => item !== null)
}

export async function addHostByTelegramId(telegramId: number): Promise<HostListItem> {
  const user = await usersRepository.getUserByTelegramId(telegramId)
  if (!user) {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      'Користувача з таким Telegram ID ще немає в системі — попросіть спочатку відкрити застосунок',
    )
  }

  const hostRow = await hostsRepository.addHost(user.id)
  const hostView = await usersRepository.getAdminUserById(user.id)
  if (!hostView) {
    throw new Error('Не вдалося прочитати щойно доданого хоста')
  }

  return { ...hostView, hostSince: hostRow.hostSince }
}

export async function removeHost(userId: string): Promise<void> {
  const removed = await hostsRepository.removeHost(userId)
  if (!removed) {
    throw new AppError(404, 'HOST_NOT_FOUND', 'Цей користувач не є хостом')
  }
}

export async function listVips(): Promise<VipListItem[]> {
  const vipRows = await vipsRepository.listVips()
  if (vipRows.length === 0) return []

  const users = await usersRepository.getUsersByIds(vipRows.map((row) => row.userId))
  const userById = new Map(users.map((user) => [user.id, user]))

  return vipRows
    .map((row) => {
      const user = userById.get(row.userId)
      return user ? { ...user, vipSince: row.vipSince } : null
    })
    .filter((item): item is VipListItem => item !== null)
}

export async function addVipByTelegramId(telegramId: number): Promise<VipListItem> {
  const user = await usersRepository.getUserByTelegramId(telegramId)
  if (!user) {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      'Користувача з таким Telegram ID ще немає в системі — попросіть спочатку відкрити застосунок',
    )
  }

  const vipRow = await vipsRepository.addVip(user.id)
  const vipView = await usersRepository.getAdminUserById(user.id)
  if (!vipView) throw new Error('Не вдалося прочитати щойно доданого VIP')
  return { ...vipView, vipSince: vipRow.vipSince }
}

export async function removeVip(userId: string): Promise<void> {
  const removed = await vipsRepository.removeVip(userId)
  if (!removed) {
    throw new AppError(404, 'VIP_NOT_FOUND', 'Цей користувач не має VIP-ролі')
  }
}

export async function listGpus(): Promise<GpuListItem[]> {
  const gpuRows = await gpusRepository.listGpus()
  if (gpuRows.length === 0) return []

  const users = await usersRepository.getUsersByIds(gpuRows.map((row) => row.userId))
  const userById = new Map(users.map((user) => [user.id, user]))

  return gpuRows
    .map((row) => {
      const user = userById.get(row.userId)
      return user ? { ...user, gpuSince: row.gpuSince } : null
    })
    .filter((item): item is GpuListItem => item !== null)
}

export async function addGpuByTelegramId(telegramId: number): Promise<GpuListItem> {
  const user = await usersRepository.getUserByTelegramId(telegramId)
  if (!user) {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      'Користувача з таким Telegram ID ще немає в системі — попросіть спочатку відкрити застосунок',
    )
  }

  const gpuRow = await gpusRepository.addGpu(user.id)
  const gpuView = await usersRepository.getAdminUserById(user.id)
  if (!gpuView) throw new Error('Не вдалося прочитати щойно доданого ГПУ')
  return { ...gpuView, gpuSince: gpuRow.gpuSince }
}

export async function removeGpu(userId: string): Promise<void> {
  const removed = await gpusRepository.removeGpu(userId)
  if (!removed) {
    throw new AppError(404, 'GPU_NOT_FOUND', 'Цей користувач не має ролі ГПУ')
  }
}
