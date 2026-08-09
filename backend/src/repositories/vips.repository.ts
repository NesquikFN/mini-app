import { query } from '../config/db'

export interface VipRow {
  userId: string
  vipSince: string
}

export const vipsRepository = {
  async isVip(userId: string): Promise<boolean> {
    const { rows } = await query('select id from vip_users where user_id = $1', [userId])
    return rows.length > 0
  },

  async listVips(): Promise<VipRow[]> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      'select user_id, created_at from vip_users order by created_at asc',
    )
    return rows.map((row) => ({ userId: row.user_id, vipSince: row.created_at }))
  },

  async addVip(userId: string): Promise<VipRow> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      `insert into vip_users (user_id) values ($1)
       on conflict (user_id) do update set user_id = excluded.user_id
       returning user_id, created_at`,
      [userId],
    )
    return { userId: rows[0].user_id, vipSince: rows[0].created_at }
  },

  async removeVip(userId: string): Promise<boolean> {
    const { rows } = await query('delete from vip_users where user_id = $1 returning id', [userId])
    return rows.length > 0
  },
}
