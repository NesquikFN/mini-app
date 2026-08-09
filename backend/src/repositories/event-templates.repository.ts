import { query } from '../config/db'
import type { EventTemplate } from '../types/admin'

interface EventTemplateRow {
  id: string
  title: string
  description: string | null
  location: string
  is_online: boolean
  max_participants: number
  group_url: string | null
  game_url: string | null
  game_url_required: boolean
  image_url: string | null
  dormitory_id: string | null
  created_at: string
  updated_at: string
}

export interface EventTemplateInput {
  title: string
  description: string
  location: string
  isOnline: boolean
  maxParticipants: number
  groupUrl?: string
  gameUrl?: string
  gameUrlRequired: boolean
  dormitoryId?: string
}

function toTemplate(row: EventTemplateRow): EventTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    location: row.location,
    isOnline: row.is_online,
    maxParticipants: row.max_participants,
    groupUrl: row.group_url ?? undefined,
    gameUrl: row.game_url ?? undefined,
    gameUrlRequired: row.game_url_required,
    imageUrl: row.image_url ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const eventTemplatesRepository = {
  async findAll(): Promise<EventTemplate[]> {
    const { rows } = await query<EventTemplateRow>(
      'select * from event_templates order by title asc',
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
         (title, description, location, is_online,
          max_participants, group_url, game_url, game_url_required, dormitory_id, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       returning *`,
      [
        input.title,
        input.description || null,
        input.location,
        input.isOnline,
        input.maxParticipants,
        input.groupUrl || null,
        input.gameUrl || null,
        input.gameUrlRequired,
        input.dormitoryId ?? null,
      ],
    )
    return toTemplate(rows[0])
  },

  async update(id: string, input: EventTemplateInput): Promise<EventTemplate | null> {
    const { rows } = await query<EventTemplateRow>(
      `update event_templates set
         title = $2, description = $3, location = $4,
         is_online = $5, max_participants = $6, group_url = $7,
         game_url = $8, game_url_required = $9, dormitory_id = $10,
         updated_at = now()
       where id = $1
       returning *`,
      [
        id,
        input.title,
        input.description || null,
        input.location,
        input.isOnline,
        input.maxParticipants,
        input.groupUrl || null,
        input.gameUrl || null,
        input.gameUrlRequired,
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
