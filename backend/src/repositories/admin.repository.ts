import { query } from '../config/db'
import { todayISODate } from '../utils/date'

async function countRows(table: 'users' | 'events' | 'event_participants'): Promise<number> {
  const { rows } = await query<{ count: string }>(`select count(*) from ${table}`)
  return Number(rows[0].count)
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
    const { rows } = await query('select id from admin_users where user_id = $1', [userId])
    return rows.length > 0
  },

  async countAdmins(): Promise<number> {
    const { rows } = await query<{ count: string }>('select count(*) from admin_users')
    return Number(rows[0].count)
  },

  /** Список рядків admin_users (лише user_id + відколи адмін) — деталі
   * профілю (ім'я, avatar, гуртожиток) домальовує admin.service через
   * usersRepository.getUsersByIds, той самий патерн, що й для creators
   * у listEvents. */
  async listAdmins(): Promise<AdminUserRow[]> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      'select user_id, created_at from admin_users order by created_at asc',
    )
    return rows.map((row) => ({ userId: row.user_id, adminSince: row.created_at }))
  },

  /** Upsert замість insert — повторне додавання того самого user_id не
   * створює дубліката й не кидає помилку unique-порушення. Повертає рядок
   * (з незмінним created_at, якщо адмін уже існував). */
  async addAdmin(userId: string): Promise<AdminUserRow> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      `insert into admin_users (user_id) values ($1)
       on conflict (user_id) do update set user_id = excluded.user_id
       returning user_id, created_at`,
      [userId],
    )
    return { userId: rows[0].user_id, adminSince: rows[0].created_at }
  },

  async removeAdmin(userId: string): Promise<boolean> {
    const { rows } = await query('delete from admin_users where user_id = $1 returning id', [userId])
    return rows.length > 0
  },

  countUsers: () => countRows('users'),

  async countRegisteredUsers(): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `select count(*) from users where registration_status = 'approved'`,
    )
    return Number(rows[0].count)
  },

  countEvents: () => countRows('events'),
  countParticipations: () => countRows('event_participants'),

  async countEventsOnDate(date: string): Promise<number> {
    const { rows } = await query<{ count: string }>('select count(*) from events where date = $1', [date])
    return Number(rows[0].count)
  },

  /** "Активні" події для дашборду адмінки — дата ще не минула (сьогодні
   * або пізніше). Не плутати з countEventsOnDate (рівно сьогодні). */
  async countUpcomingEvents(): Promise<number> {
    const { rows } = await query<{ count: string }>(
      'select count(*) from events where date >= $1',
      [todayISODate()],
    )
    return Number(rows[0].count)
  },

  /** Скільки подій створив кожен із переданих users.id — один запит на
   * всю сторінку списку користувачів, а не по запиту на людину. */
  async countEventsByCreatorIds(ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (ids.length === 0) return counts

    const { rows } = await query<{ creator_id: string }>(
      'select creator_id from events where creator_id = any($1)',
      [ids],
    )
    for (const row of rows) {
      counts.set(row.creator_id, (counts.get(row.creator_id) ?? 0) + 1)
    }
    return counts
  },

  /** "Активний" тут означає: хоч раз створив подію або приєднався до
   * чиєїсь. Немає окремого поля активності на users, тому рахуємо як
   * об'єднання двох множин id — простіше й прозоріше, ніж заводити SQL
   * функцію для метрики, що ще може змінитись. */
  async countActiveUsers(): Promise<number> {
    const { rows } = await query<{ id: string }>(`
      select creator_id as id from events
      union
      select user_id as id from event_participants
    `)
    return rows.length
  },
}
