import { supabase } from '../config/supabase'
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
    const { data, error } = await supabase
      .from('dormitories')
      .select('*')
      .order('name', { ascending: true })
      .returns<DormitoryRow[]>()

    if (error) throw error
    return data.map(toDormitory)
  },

  /** Для валідації dormitoryId, що приходить у PATCH /me — щоб дати
   * зрозумілу 400-помилку замість сирої помилки FK-порушення з Postgres. */
  async exists(id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('dormitories')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data !== null
  },
}
