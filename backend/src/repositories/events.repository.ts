import { query } from '../config/db'
import { AppError } from '../utils/AppError'
import { addDays, todayISODate, toISODate } from '../utils/date'
import type { Event } from '../types/event'

export type EventDateFilter = 'today' | 'week' | 'all'

interface EventRow {
  id: string
  creator_id: string
  title: string
  description: string | null
  image_url: string | null
  group_url: string | null
  is_online: boolean
  date: string
  time: string
  location: string
  max_participants: number
  created_at: string
  dormitory_id: string
  source_template_id: string | null
  participant_ids: string[]
}

export interface NewEvent {
  creatorId: string
  title: string
  description: string
  imageUrl?: string
  groupUrl?: string
  isOnline: boolean
  date: string
  time: string
  location: string
  maxParticipants: number
  /** Береться з creator's users.dormitory_id на рівні сервісу — сюди
   * ніколи не потрапляє значення з клієнтського запиту. */
  dormitoryId: string
  sourceTemplateId?: string
}

// participant_ids — агрегований масив через LEFT JOIN + array_agg, той
// самий "один запит замість N+1", що раніше давав вкладений PostgREST-select.
const EVENTS_BASE_SELECT = `
  select e.*,
    coalesce(array_agg(ep.user_id) filter (where ep.user_id is not null), '{}') as participant_ids
  from events e
  left join event_participants ep on ep.event_id = e.id
`

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description ?? '',
    imageUrl: row.image_url ?? undefined,
    groupUrl: row.group_url ?? undefined,
    isOnline: row.is_online,
    date: row.date,
    time: row.time,
    location: row.location,
    maxParticipants: row.max_participants,
    participantIds: row.participant_ids,
    createdAt: row.created_at,
    dormitoryId: row.dormitory_id,
    sourceTemplateId: row.source_template_id ?? undefined,
  }
}

/** Перекладає відомі помилки функції join_event у доменні AppError. */
function translateJoinError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('EVENT_NOT_FOUND')) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (message.includes('ALREADY_JOINED')) {
    throw new AppError(409, 'ALREADY_JOINED', 'Ви вже берете участь у цій події')
  }
  if (message.includes('EVENT_FULL')) {
    throw new AppError(409, 'EVENT_FULL', 'Місць більше немає')
  }
  throw error
}

export const eventsRepository = {
  /** dormitoryId — необов'язковий server-side фільтр (звідки саме він
   * узятий і чи довіряти йому, вирішує events.service, не тут). Без
   * нього — усі гуртожитки. */
  async findAll(dormitoryId?: string): Promise<Event[]> {
    // Physical events stay scoped to the selected dormitory, while
    // online events are global and must be visible to everyone.
    const where = dormitoryId ? 'where e.dormitory_id = $1 or e.is_online = true' : ''
    const { rows } = await query<EventRow>(
      `${EVENTS_BASE_SELECT} ${where} group by e.id order by e.date asc`,
      dormitoryId ? [dormitoryId] : [],
    )
    return rows.map(toEvent)
  },

  /** Адмінський список подій — сторінками, з пошуком по назві та
   * фільтром по даті. */
  async findPaginated(
    page: number,
    limit: number,
    search?: string,
    dateFilter: EventDateFilter = 'all',
  ): Promise<{ events: Event[]; total: number }> {
    const conditions: string[] = []
    const params: unknown[] = []

    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
      params.push(`%${trimmedSearch}%`)
      conditions.push(`e.title ilike $${params.length}`)
    }
    if (dateFilter === 'today') {
      params.push(todayISODate())
      conditions.push(`e.date = $${params.length}`)
    } else if (dateFilter === 'week') {
      params.push(todayISODate())
      conditions.push(`e.date >= $${params.length}`)
      params.push(toISODate(addDays(new Date(), 7)))
      conditions.push(`e.date <= $${params.length}`)
    }

    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''
    const offset = (page - 1) * limit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query<EventRow>(
        `${EVENTS_BASE_SELECT} ${where} group by e.id order by e.date asc
         limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query<{ count: string }>(`select count(*) from events e ${where}`, params),
    ])

    return { events: rows.map(toEvent), total: Number(countRows[0].count) }
  },

  async findById(id: string): Promise<Event | null> {
    const { rows } = await query<EventRow>(
      `${EVENTS_BASE_SELECT} where e.id = $1 group by e.id`,
      [id],
    )
    return rows[0] ? toEvent(rows[0]) : null
  },

  async insert(newEvent: NewEvent): Promise<Event> {
    const { rows } = await query<{ id: string }>(
      `insert into events
         (creator_id, title, description, image_url, group_url, is_online,
          date, time, location, max_participants, dormitory_id, source_template_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        newEvent.creatorId,
        newEvent.title,
        newEvent.description || null,
        newEvent.imageUrl || null,
        newEvent.groupUrl || null,
        newEvent.isOnline,
        newEvent.date,
        newEvent.time,
        newEvent.location,
        newEvent.maxParticipants,
        newEvent.dormitoryId,
        newEvent.sourceTemplateId ?? null,
      ],
    )

    // Творець автоматично стає учасником власної події. Той самий
    // атомарний шлях (join_event), що й для звичайного приєднання —
    // подія щойно створена з 0 учасників, тож EVENT_FULL тут неможливий.
    await eventsRepository.addParticipant(rows[0].id, newEvent.creatorId)

    const created = await eventsRepository.findById(rows[0].id)
    if (!created) {
      throw new Error('Не вдалося прочитати щойно створену подію')
    }
    return created
  },

  /** Часткове оновлення — лише адмін-панель, звичайний Mini App редагування
   * подій не пропонує. */
  async update(id: string, patch: Partial<Omit<NewEvent, 'creatorId'>>): Promise<Event> {
    const columns: Record<string, unknown> = {}
    if (patch.title !== undefined) columns.title = patch.title
    if (patch.description !== undefined) columns.description = patch.description || null
    if (patch.imageUrl !== undefined) columns.image_url = patch.imageUrl || null
    if (patch.groupUrl !== undefined) columns.group_url = patch.groupUrl || null
    if (patch.isOnline !== undefined) columns.is_online = patch.isOnline
    if (patch.date !== undefined) columns.date = patch.date
    if (patch.time !== undefined) columns.time = patch.time
    if (patch.location !== undefined) columns.location = patch.location
    if (patch.maxParticipants !== undefined) columns.max_participants = patch.maxParticipants

    const keys = Object.keys(columns)
    if (keys.length > 0) {
      const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ')
      await query(`update events set ${setClause} where id = $1`, [id, ...keys.map((key) => columns[key])])
    }

    const updated = await eventsRepository.findById(id)
    if (!updated) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
    }
    return updated
  },

  async remove(id: string): Promise<boolean> {
    const { rows } = await query('delete from events where id = $1 returning id', [id])
    return rows.length > 0
  },

  async removeByCreatorId(creatorId: string): Promise<void> {
    await query('delete from events where creator_id = $1', [creatorId])
  },

  /** Атомарне приєднання через PostgreSQL-функцію join_event — захищає
   * від race condition при одночасних спробах зайняти останнє місце
   * (див. database/schema.sql). */
  async addParticipant(eventId: string, userId: string): Promise<void> {
    try {
      await query('select join_event($1, $2)', [eventId, userId])
    } catch (error) {
      translateJoinError(error)
    }
  },

  async removeParticipant(eventId: string, userId: string): Promise<boolean> {
    const { rows } = await query(
      'delete from event_participants where event_id = $1 and user_id = $2 returning id',
      [eventId, userId],
    )
    return rows.length > 0
  },

  async getParticipants(eventId: string): Promise<string[]> {
    const { rows } = await query<{ user_id: string }>(
      'select user_id from event_participants where event_id = $1',
      [eventId],
    )
    return rows.map((row) => row.user_id)
  },

  async isParticipant(eventId: string, userId: string): Promise<boolean> {
    const { rows } = await query(
      'select id from event_participants where event_id = $1 and user_id = $2',
      [eventId, userId],
    )
    return rows.length > 0
  },

  async getUserCreatedEvents(userId: string): Promise<Event[]> {
    const { rows } = await query<EventRow>(
      `${EVENTS_BASE_SELECT} where e.creator_id = $1 group by e.id order by e.date asc`,
      [userId],
    )
    return rows.map(toEvent)
  },

  async getUserParticipatingEvents(userId: string): Promise<Event[]> {
    const { rows: participantRows } = await query<{ event_id: string }>(
      'select event_id from event_participants where user_id = $1',
      [userId],
    )
    const eventIds = participantRows.map((row) => row.event_id)
    if (eventIds.length === 0) return []

    const { rows } = await query<EventRow>(
      `${EVENTS_BASE_SELECT} where e.id = any($1) group by e.id order by e.date asc`,
      [eventIds],
    )
    return rows.map(toEvent)
  },
}
