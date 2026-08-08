import { query } from '../config/db'
import type { EventTemplate } from '../types/admin'

interface EventTemplateRow {
  id: string
  title: string
  description: string | null
  weekday: number
  time: string
  location: string
  is_online: boolean
  max_participants: number
  group_url: string | null
  image_url: string | null
  dormitory_id: string | null
  created_at: string
  updated_at: string
}

export interface EventTemplateInput {
  title: string
  description: string
  weekday: number
  time: string
  location: string
  isOnline: boolean
  maxParticipants: number
  groupUrl?: string
  dormitoryId?: string
}

function toTemplate(row: EventTemplateRow): EventTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    weekday: row.weekday,
    time: row.time,
    location: row.location,
    isOnline: row.is_online,
    maxParticipants: row.max_participants,
    groupUrl: row.group_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const eventTemplatesRepository = {
  async findAll(): Promise<EventTemplate[]> {
    const { rows } = await query<EventTemplateRow>(
      'select * from event_templates order by weekday asc, time asc',
    )
    return rows.map(toTemplate)
  },

  async findById(id: string): Promise<EventTemplate | null> {
    const { rows } = await query<EventTemplateRow>('select * from event_templates where id = $1', [id])
    return rows[0] ? toTemplate(rows[0]) : null
  },

  async insert(input: EventTemplateInput): Promise<EventTemplate> {
    const { rows } = await query<EventTemplateRow>(
      `insert into event_templates
         (title, description, weekday, time, location, is_online,
          max_participants, group_url, dormitory_id, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       returning *`,
      [
        input.title,
        input.description || null,
        input.weekday,
        input.time,
        input.location,
        input.isOnline,
        input.maxParticipants,
        input.groupUrl || null,
        input.dormitoryId ?? null,
      ],
    )
    return toTemplate(rows[0])
  },

  async update(id: string, input: EventTemplateInput): Promise<EventTemplate | null> {
    const { rows } = await query<EventTemplateRow>(
      `update event_templates set
         title = $2, description = $3, weekday = $4, time = $5, location = $6,
         is_online = $7, max_participants = $8, group_url = $9, dormitory_id = $10,
         updated_at = now()
       where id = $1
       returning *`,
      [
        id,
        input.title,
        input.description || null,
        input.weekday,
        input.time,
        input.location,
        input.isOnline,
        input.maxParticipants,
        input.groupUrl || null,
        input.dormitoryId ?? null,
      ],
    )
    return rows[0] ? toTemplate(rows[0]) : null
  },

  async updateImage(id: string, imageUrl: string): Promise<EventTemplate | null> {
    const { rows } = await query<EventTemplateRow>(
      'update event_templates set image_url = $2, updated_at = now() where id = $1 returning *',
      [id, imageUrl],
    )
    return rows[0] ? toTemplate(rows[0]) : null
  },

  async remove(id: string): Promise<boolean> {
    const { rows } = await query('delete from event_templates where id = $1 returning id', [id])
    return rows.length > 0
  },
}
