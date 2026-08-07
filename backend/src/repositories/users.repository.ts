import { supabase } from '../config/supabase'
import type { AdminUserView, AuthUser, PublicUser } from '../types/user'

interface UserRow {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  last_name: string | null
  photo_url: string | null
  dormitory_id: string | null
  banned_until: string | null
  banned_permanently: boolean
  created_at: string
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    firstName: row.first_name,
    username: row.username ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
    bannedUntil: row.banned_until ?? undefined,
    bannedPermanently: row.banned_permanently,
  }
}

function toAdminUserView(row: UserRow): AdminUserView {
  return {
    id: row.id,
    telegramId: row.telegram_id,
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

export const usersRepository = {
  async getUserByTelegramId(telegramId: number): Promise<AuthUser | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle<UserRow>()

    if (error) throw error
    return data ? toAuthUser(data) : null
  },

  async getUserById(id: string): Promise<AuthUser | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle<UserRow>()

    if (error) throw error
    return data ? toAuthUser(data) : null
  },

  async createUser(input: NewUser): Promise<AuthUser> {
    const { data, error } = await supabase
      .from('users')
      .insert({
        telegram_id: input.telegramId,
        first_name: input.firstName,
        username: input.username ?? null,
        photo_url: input.photoUrl ?? null,
      })
      .select('*')
      .single<UserRow>()

    if (error) throw error
    return toAuthUser(data)
  },

  /** Викликається при повторному Telegram-логіні — Telegram щоразу надсилає
   * поточні first_name/username/photo_url в initData, і вони можуть
   * відрізнятись від того, що збережено (людина змінила ім'я чи аватар). */
  async updateProfile(id: string, input: ProfileUpdate): Promise<AuthUser> {
    const { data, error } = await supabase
      .from('users')
      .update({
        first_name: input.firstName,
        username: input.username ?? null,
        photo_url: input.photoUrl ?? null,
      })
      .eq('id', id)
      .select('*')
      .single<UserRow>()

    if (error) throw error
    return toAuthUser(data)
  },

  /** Онбординг та подальша зміна гуртожитку через профіль. Окремий
   * маленький update, а не частина updateProfile — той викликається
   * автоматично при кожному Telegram-логіні й не повинен ненавмисно
   * зачіпати dormitory_id. */
  async setDormitory(id: string, dormitoryId: string): Promise<AuthUser> {
    const { data, error } = await supabase
      .from('users')
      .update({ dormitory_id: dormitoryId })
      .eq('id', id)
      .select('*')
      .single<UserRow>()

    if (error) throw error
    return toAuthUser(data)
  },

  async getAllUsers(): Promise<AdminUserView[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .returns<UserRow[]>()

    if (error) throw error
    return data.map(toAdminUserView)
  },

  async getUsersByIds(ids: string[]): Promise<AdminUserView[]> {
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('id', ids)
      .returns<UserRow[]>()

    if (error) throw error
    return data.map(toAdminUserView)
  },

  /** Для показу організатора/учасників звичайним користувачам DormHub —
   * запитує лише публічно-безпечні колонки (не '*'), щоб навіть випадково
   * не протягнути щось приватне повз toPublicUser. */
  async getPublicUsersByIds(ids: string[]): Promise<PublicUser[]> {
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, username, photo_url, dormitory_id')
      .in('id', ids)
      .returns<PublicUserRow[]>()

    if (error) throw error
    return data.map(toPublicUser)
  },

  async getAdminUserById(id: string): Promise<AdminUserView | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle<UserRow>()

    if (error) throw error
    return data ? toAdminUserView(data) : null
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
    let query = supabase.from('users').select('*', { count: 'exact' })

    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
      const escaped = trimmedSearch.replace(/[%_]/g, (char) => `\\${char}`)
      const orFilters = [`first_name.ilike.%${escaped}%`, `username.ilike.%${escaped}%`]
      if (/^\d+$/.test(trimmedSearch)) {
        orFilters.push(`telegram_id.eq.${trimmedSearch}`)
      }
      query = query.or(orFilters.join(','))
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<UserRow[]>()

    if (error) throw error
    return { users: data.map(toAdminUserView), total: count ?? 0 }
  },

  async remove(id: string): Promise<boolean> {
    const { data, error } = await supabase.from('users').delete().eq('id', id).select('id')
    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  async ban(id: string, bannedUntil: string | null, bannedPermanently: boolean): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ banned_until: bannedUntil, banned_permanently: bannedPermanently })
      .eq('id', id)
    if (error) throw error
  },

  async unban(id: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ banned_until: null, banned_permanently: false })
      .eq('id', id)
    if (error) throw error
  },

  async getBannedUsers(): Promise<AdminUserView[]> {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`banned_permanently.eq.true,banned_until.gt.${now}`)
      .order('banned_permanently', { ascending: false })
      .order('banned_until', { ascending: true })
      .returns<UserRow[]>()

    if (error) throw error
    return data.map(toAdminUserView)
  },
}
