import { supabase } from '../config/supabase'
import type { AdminUserView, AuthUser } from '../types/user'

interface UserRow {
  id: string
  telegram_id: number
  username: string | null
  first_name: string
  last_name: string | null
  photo_url: string | null
  created_at: string
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    firstName: row.first_name,
    username: row.username ?? undefined,
  }
}

function toAdminUserView(row: UserRow): AdminUserView {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
    createdAt: row.created_at,
  }
}

export interface NewUser {
  telegramId: number
  firstName: string
  username?: string
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
      })
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
}
