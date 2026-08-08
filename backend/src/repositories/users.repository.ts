import { query } from '../config/db'
import type { AdminUserView, AuthUser, PublicUser } from '../types/user'

interface UserRow {
  id: string
  telegram_id: string
  username: string | null
  first_name: string
  last_name: string | null
  photo_url: string | null
  dormitory_id: string | null
  banned_until: string | null
  banned_permanently: boolean
  created_at: string
  notify_new_events: boolean
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    firstName: row.first_name,
    username: row.username ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
    bannedUntil: row.banned_until ?? undefined,
    bannedPermanently: row.banned_permanently,
    notifyNewEvents: row.notify_new_events,
  }
}

function toAdminUserView(row: UserRow): AdminUserView {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
    createdAt: row.created_at,
    bannedUntil: row.banned_until ?? undefined,
    bannedPermanently: row.banned_permanently,
  }
}

interface PublicUserRow {
  id: string
  first_name: string
  username: string | null
  photo_url: string | null
  dormitory_id: string | null
}

function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    firstName: row.first_name,
    username: row.username ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
  }
}

export interface NewUser {
  telegramId: number
  firstName: string
  username?: string
  photoUrl?: string
}

export interface ProfileUpdate {
  firstName: string
  username?: string
  photoUrl?: string
}

const PUBLIC_USER_COLUMNS = 'id, first_name, username, photo_url, dormitory_id'

export const usersRepository = {
  async getUserByTelegramId(telegramId: number): Promise<AuthUser | null> {
    const { rows } = await query<UserRow>('select * from users where telegram_id = $1', [telegramId])
    return rows[0] ? toAuthUser(rows[0]) : null
  },

  async getUserById(id: string): Promise<AuthUser | null> {
    const { rows } = await query<UserRow>('select * from users where id = $1', [id])
    return rows[0] ? toAuthUser(rows[0]) : null
  },

  async createUser(input: NewUser): Promise<AuthUser> {
    const { rows } = await query<UserRow>(
      `insert into users (telegram_id, first_name, username, photo_url)
       values ($1, $2, $3, $4)
       returning *`,
      [input.telegramId, input.firstName, input.username ?? null, input.photoUrl ?? null],
    )
    return toAuthUser(rows[0])
  },

  /** Викликається при повторному Telegram-логіні — Telegram щоразу надсилає
   * поточні first_name/username/photo_url в initData, і вони можуть
   * відрізнятись від того, що збережено (людина змінила ім'я чи аватар). */
  async updateProfile(id: string, input: ProfileUpdate): Promise<AuthUser> {
    const { rows } = await query<UserRow>(
      `update users set first_name = $2, username = $3, photo_url = $4
       where id = $1
       returning *`,
      [id, input.firstName, input.username ?? null, input.photoUrl ?? null],
    )
    return toAuthUser(rows[0])
  },

  /** Онбординг та подальша зміна гуртожитку через профіль. Окремий
   * маленький update, а не частина updateProfile — той викликається
   * автоматично при кожному Telegram-логіні й не повинен ненавмисно
   * зачіпати dormitory_id. */
  async setDormitory(id: string, dormitoryId: string): Promise<AuthUser> {
    const { rows } = await query<UserRow>(
      'update users set dormitory_id = $2 where id = $1 returning *',
      [id, dormitoryId],
    )
    return toAuthUser(rows[0])
  },

  async setNotifyNewEvents(id: string, notify: boolean): Promise<AuthUser> {
    const { rows } = await query<UserRow>(
      'update users set notify_new_events = $2 where id = $1 returning *',
      [id, notify],
    )
    return toAuthUser(rows[0])
  },

  /** telegram_id тих, хто підписався на особисті DM-сповіщення про нові
   * події (окремо від групового чату) — для announceEvent у events.service.ts. */
  async getSubscribedTelegramIds(): Promise<number[]> {
    const { rows } = await query<{ telegram_id: string }>(
      'select telegram_id from users where notify_new_events = true',
    )
    return rows.map((row) => Number(row.telegram_id))
  },

  async getAllUsers(): Promise<AdminUserView[]> {
    const { rows } = await query<UserRow>('select * from users order by created_at desc')
    return rows.map(toAdminUserView)
  },

  async getUsersByIds(ids: string[]): Promise<AdminUserView[]> {
    if (ids.length === 0) return []
    const { rows } = await query<UserRow>('select * from users where id = any($1)', [ids])
    return rows.map(toAdminUserView)
  },

  /** Для показу організатора/учасників звичайним користувачам DormHub —
   * запитує лише публічно-безпечні колонки (не '*'), щоб навіть випадково
   * не протягнути щось приватне повз toPublicUser. */
  async getPublicUsersByIds(ids: string[]): Promise<PublicUser[]> {
    if (ids.length === 0) return []
    const { rows } = await query<PublicUserRow>(
      `select ${PUBLIC_USER_COLUMNS} from users where id = any($1)`,
      [ids],
    )
    return rows.map(toPublicUser)
  },

  async getPublicUserById(id: string): Promise<PublicUser | null> {
    const { rows } = await query<PublicUserRow>(
      `select ${PUBLIC_USER_COLUMNS} from users where id = $1`,
      [id],
    )
    return rows[0] ? toPublicUser(rows[0]) : null
  },

  async getAdminUserById(id: string): Promise<AdminUserView | null> {
    const { rows } = await query<UserRow>('select * from users where id = $1', [id])
    return rows[0] ? toAdminUserView(rows[0]) : null
  },

  /** Адмінський список користувачів — сторінками, з пошуком по імені,
   * username чи telegram_id. `search` як ціле число додає точний збіг по
   * telegram_id (окрім ilike по тексту), а не намагається порівняти
   * bigint-колонку з нечисловим рядком (Postgres на це впав би помилкою
   * типу). */
  async getUsersPaginated(
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ users: AdminUserView[]; total: number }> {
    const trimmedSearch = search?.trim()
    const conditions: string[] = []
    const params: unknown[] = []

    if (trimmedSearch) {
      params.push(`%${trimmedSearch}%`)
      const nameMatch = `(first_name ilike $${params.length} or username ilike $${params.length})`
      if (/^\d+$/.test(trimmedSearch)) {
        params.push(trimmedSearch)
        conditions.push(`(${nameMatch} or telegram_id = $${params.length})`)
      } else {
        conditions.push(nameMatch)
      }
    }

    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''
    const offset = (page - 1) * limit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query<UserRow>(
        `select * from users ${where} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query<{ count: string }>(`select count(*) from users ${where}`, params),
    ])

    return { users: rows.map(toAdminUserView), total: Number(countRows[0].count) }
  },

  async remove(id: string): Promise<boolean> {
    const { rows } = await query('delete from users where id = $1 returning id', [id])
    return rows.length > 0
  },

  async ban(id: string, bannedUntil: string | null, bannedPermanently: boolean): Promise<void> {
    await query('update users set banned_until = $2, banned_permanently = $3 where id = $1', [
      id,
      bannedUntil,
      bannedPermanently,
    ])
  },

  async unban(id: string): Promise<void> {
    await query('update users set banned_until = null, banned_permanently = false where id = $1', [id])
  },

  async getBannedUsers(): Promise<AdminUserView[]> {
    const { rows } = await query<UserRow>(
      `select * from users
       where banned_permanently = true or banned_until > now()
       order by banned_permanently desc, banned_until asc`,
    )
    return rows.map(toAdminUserView)
  },
}
