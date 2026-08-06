import { supabase } from '../config/supabase'

async function countRows(table: 'users' | 'events' | 'event_participants'): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
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
