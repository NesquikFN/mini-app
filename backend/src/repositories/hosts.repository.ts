import { query } from '../config/db'

export interface HostRow {
  userId: string
  hostSince: string
}

/** "Хост" — право керувати шаблонами ігор, окремо від admin_users.
 * Той самий шаблон запитів, що й admin.repository.ts. */
export const hostsRepository = {
  async isHost(userId: string): Promise<boolean> {
    const { rows } = await query('select id from hosts where user_id = $1', [userId])
    return rows.length > 0
  },

  async listHosts(): Promise<HostRow[]> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      'select user_id, created_at from hosts order by created_at asc',
    )
    return rows.map((row) => ({ userId: row.user_id, hostSince: row.created_at }))
  },

  async addHost(userId: string): Promise<HostRow> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      `insert into hosts (user_id) values ($1)
       on conflict (user_id) do update set user_id = excluded.user_id
       returning user_id, created_at`,
      [userId],
    )
    return { userId: rows[0].user_id, hostSince: rows[0].created_at }
  },

  async removeHost(userId: string): Promise<boolean> {
    const { rows } = await query('delete from hosts where user_id = $1 returning id', [userId])
    return rows.length > 0
  },
}
