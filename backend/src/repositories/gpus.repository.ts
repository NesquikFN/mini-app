import { query } from '../config/db'

export interface GpuRow {
  userId: string
  gpuSince: string
}

export const gpusRepository = {
  async isGpu(userId: string): Promise<boolean> {
    const { rows } = await query('select id from gpu_users where user_id = $1', [userId])
    return rows.length > 0
  },

  async listGpus(): Promise<GpuRow[]> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      'select user_id, created_at from gpu_users order by created_at asc',
    )
    return rows.map((row) => ({ userId: row.user_id, gpuSince: row.created_at }))
  },

  async addGpu(userId: string): Promise<GpuRow> {
    const { rows } = await query<{ user_id: string; created_at: string }>(
      `insert into gpu_users (user_id) values ($1)
       on conflict (user_id) do update set user_id = excluded.user_id
       returning user_id, created_at`,
      [userId],
    )
    return { userId: rows[0].user_id, gpuSince: rows[0].created_at }
  },

  async removeGpu(userId: string): Promise<boolean> {
    const { rows } = await query('delete from gpu_users where user_id = $1 returning id', [userId])
    return rows.length > 0
  },
}
