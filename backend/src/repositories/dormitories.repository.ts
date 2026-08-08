import { query } from '../config/db'
import type { Dormitory } from '../types/dormitory'

interface DormitoryRow {
  id: string
  name: string
  short_name: string | null
  created_at: string
}

function toDormitory(row: DormitoryRow): Dormitory {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name ?? undefined,
    createdAt: row.created_at,
  }
}

export const dormitoriesRepository = {
  async findAll(): Promise<Dormitory[]> {
    const { rows } = await query<DormitoryRow>('select * from dormitories order by name asc')
    return rows.map(toDormitory)
  },

  /** Для валідації dormitoryId, що приходить у PATCH /me — щоб дати
   * зрозумілу 400-помилку замість сирої помилки FK-порушення з Postgres. */
  async exists(id: string): Promise<boolean> {
    const { rows } = await query('select id from dormitories where id = $1', [id])
    return rows.length > 0
  },
}
