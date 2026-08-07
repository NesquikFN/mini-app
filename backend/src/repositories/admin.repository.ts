import { supabase } from '../config/supabase'
import { todayISODate } from '../utils/date'

async function countRows(table: 'users' | 'events' | 'event_participants'): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

export interface AdminUserRow {
  userId: string
  adminSince: string
}

export const adminRepository = {
  /** Єдине джерело істини "чи є цей users.id адміністратором" — і для
   * middleware/requireAdmin.ts, і для будь-якої майбутньої адмінської
   * перевірки. Порожній admin_users означає "адмінів ще нема" (403 для
   * всіх), а не "усім можна". */
  async isAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data !== null
  },

  async countAdmins(): Promise<number> {
    const { count, error } = await supabase
      .from('admin_users')
      .select('*', { count: 'exact', head: true })

    if (error) throw error
    return count ?? 0
  },

  /** Список рядків admin_users (лише user_id + відколи адмін) — деталі
   * профілю (ім'я, avatar, гуртожиток) домальовує admin.service через
   * usersRepository.getUsersByIds, той самий патерн, що й для creators
   * у listEvents. */
  async listAdmins(): Promise<AdminUserRow[]> {
    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id, created_at')
      .order('created_at', { ascending: true })
      .returns<{ user_id: string; created_at: string }[]>()

    if (error) throw error
    return data.map((row) => ({ userId: row.user_id, adminSince: row.created_at }))
  },

  /** Upsert замість insert — повторне додавання того самого user_id не
   * створює дубліката й не кидає помилку unique-порушення. Повертає рядок
   * (з незмінним created_at, якщо адмін уже існував). */
  async addAdmin(userId: string): Promise<AdminUserRow> {
    const { data, error } = await supabase
      .from('admin_users')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })
      .select('user_id, created_at')
      .single<{ user_id: string; created_at: string }>()

    if (error) throw error
    return { userId: data.user_id, adminSince: data.created_at }
  },

  async removeAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('admin_users')
      .delete()
      .eq('user_id', userId)
      .select('id')

    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  countUsers: () => countRows('users'),
  countEvents: () => countRows('events'),
  countParticipations: () => countRows('event_participants'),

  async countEventsOnDate(date: string): Promise<number> {
    const { count, error } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('date', date)

    if (error) throw error
    return count ?? 0
  },

  /** "Активні" події для дашборду адмінки — дата ще не минула (сьогодні
   * або пізніше). Не плутати з countEventsOnDate (рівно сьогодні). */
  async countUpcomingEvents(): Promise<number> {
    const { count, error } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gte('date', todayISODate())

    if (error) throw error
    return count ?? 0
  },

  /** Скільки подій створив кожен із переданих users.id — один запит на
   * всю сторінку списку користувачів, а не по запиту на людину. */
  async countEventsByCreatorIds(ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (ids.length === 0) return counts

    const { data, error } = await supabase
      .from('events')
      .select('creator_id')
      .in('creator_id', ids)

    if (error) throw error

    for (const row of data as { creator_id: string }[]) {
      counts.set(row.creator_id, (counts.get(row.creator_id) ?? 0) + 1)
    }
    return counts
  },

  /** "Активний" тут означає: хоч раз створив подію або приєднався до
   * чиєїсь. Немає окремого поля активності на users, тому рахуємо як
   * об'єднання двох множин id — простіше й прозоріше, ніж заводити SQL
   * функцію для метрики, що ще може змінитись. */
  async countActiveUsers(): Promise<number> {
    const [creators, participants] = await Promise.all([
      supabase.from('events').select('creator_id'),
      supabase.from('event_participants').select('user_id'),
    ])

    if (creators.error) throw creators.error
    if (participants.error) throw participants.error

    const activeIds = new Set<string>()
    for (const row of creators.data as { creator_id: string }[]) {
      activeIds.add(row.creator_id)
    }
    for (const row of participants.data as { user_id: string }[]) {
      activeIds.add(row.user_id)
    }
    return activeIds.size
  },
}
