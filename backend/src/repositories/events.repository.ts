import { supabase } from '../config/supabase'
import { AppError } from '../utils/AppError'
import { addDays, todayISODate, toISODate } from '../utils/date'
import type { Event } from '../types/event'

export type EventDateFilter = 'today' | 'week' | 'all'

interface EventRow {
  id: string
  creator_id: string
  title: string
  description: string | null
  date: string
  time: string
  location: string
  max_participants: number
  created_at: string
  dormitory_id: string
  event_participants: { user_id: string }[]
}

export interface NewEvent {
  creatorId: string
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  /** Береться з creator's users.dormitory_id на рівні сервісу — сюди
   * ніколи не потрапляє значення з клієнтського запиту. */
  dormitoryId: string
}

// event_participants(user_id) — вкладена вибірка: PostgREST підтягує
// пов'язані рядки з event_participants в одному запиті, замість окремого
// SELECT на кожну подію.
const EVENT_SELECT = '*, event_participants(user_id)'

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description ?? '',
    date: row.date,
    time: row.time,
    location: row.location,
    maxParticipants: row.max_participants,
    participantIds: row.event_participants.map((participant) => participant.user_id),
    createdAt: row.created_at,
    dormitoryId: row.dormitory_id,
  }
}

/** Перекладає відомі помилки RPC join_event у доменні AppError. */
function translateJoinError(error: { message: string }): never {
  if (error.message === 'EVENT_NOT_FOUND') {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (error.message === 'ALREADY_JOINED') {
    throw new AppError(409, 'ALREADY_JOINED', 'Ви вже берете участь у цій події')
  }
  if (error.message === 'EVENT_FULL') {
    throw new AppError(409, 'EVENT_FULL', 'Місць більше немає')
  }
  throw error
}

export const eventsRepository = {
  /** dormitoryId — необов'язковий server-side фільтр (звідки саме він
   * узятий і чи довіряти йому, вирішує events.service, не тут). Без
   * нього — усі гуртожитки. */
  async findAll(dormitoryId?: string): Promise<Event[]> {
    let query = supabase.from('events').select(EVENT_SELECT)
    if (dormitoryId) {
      query = query.eq('dormitory_id', dormitoryId)
    }

    const { data, error } = await query
      .order('date', { ascending: true })
      .returns<EventRow[]>()

    if (error) throw error
    return data.map(toEvent)
  },

  /** Адмінський список подій — сторінками, з пошуком по назві та
   * фільтром по даті. Той самий EVENT_SELECT, що й скрізь, тож
   * participantIds доступні одразу без окремого запиту на лічильник. */
  async findPaginated(
    page: number,
    limit: number,
    search?: string,
    dateFilter: EventDateFilter = 'all',
  ): Promise<{ events: Event[]; total: number }> {
    let query = supabase.from('events').select(EVENT_SELECT, { count: 'exact' })

    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
      const escaped = trimmedSearch.replace(/[%_]/g, (char) => `\\${char}`)
      query = query.ilike('title', `%${escaped}%`)
    }

    if (dateFilter === 'today') {
      query = query.eq('date', todayISODate())
    } else if (dateFilter === 'week') {
      query = query.gte('date', todayISODate()).lte('date', toISODate(addDays(new Date(), 7)))
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await query
      .order('date', { ascending: true })
      .range(from, to)
      .returns<EventRow[]>()

    if (error) throw error
    return { events: data.map(toEvent), total: count ?? 0 }
  },

  async findById(id: string): Promise<Event | null> {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('id', id)
      .maybeSingle<EventRow>()

    if (error) throw error
    return data ? toEvent(data) : null
  },

  async insert(newEvent: NewEvent): Promise<Event> {
    const { data, error } = await supabase
      .from('events')
      .insert({
        creator_id: newEvent.creatorId,
        title: newEvent.title,
        description: newEvent.description || null,
        date: newEvent.date,
        time: newEvent.time,
        location: newEvent.location,
        max_participants: newEvent.maxParticipants,
        dormitory_id: newEvent.dormitoryId,
      })
      .select('id')
      .single<{ id: string }>()

    if (error) throw error

    // Творець автоматично стає учасником власної події. Той самий
    // атомарний шлях (join_event), що й для звичайного приєднання —
    // подія щойно створена з 0 учасників, тож EVENT_FULL тут неможливий.
    await eventsRepository.addParticipant(data.id, newEvent.creatorId)

    const created = await eventsRepository.findById(data.id)
    if (!created) {
      throw new Error('Не вдалося прочитати щойно створену подію')
    }
    return created
  },

  /** Часткове оновлення — лише адмін-панель, звичайний Mini App редагування
   * подій не пропонує. */
  async update(id: string, patch: Partial<Omit<NewEvent, 'creatorId'>>): Promise<Event> {
    const updatePayload: Record<string, unknown> = {}
    if (patch.title !== undefined) updatePayload.title = patch.title
    if (patch.description !== undefined) updatePayload.description = patch.description || null
    if (patch.date !== undefined) updatePayload.date = patch.date
    if (patch.time !== undefined) updatePayload.time = patch.time
    if (patch.location !== undefined) updatePayload.location = patch.location
    if (patch.maxParticipants !== undefined) updatePayload.max_participants = patch.maxParticipants

    const { error } = await supabase.from('events').update(updatePayload).eq('id', id)
    if (error) throw error

    const updated = await eventsRepository.findById(id)
    if (!updated) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
    }
    return updated
  },

  async remove(id: string): Promise<boolean> {
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id')
    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  /** Атомарне приєднання через PostgreSQL-функцію join_event (RPC) —
   * захищає від race condition при одночасних спробах зайняти останнє
   * місце (див. database/schema.sql). */
  async addParticipant(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('join_event', {
      p_event_id: eventId,
      p_user_id: userId,
    })

    if (error) translateJoinError(error)
  },

  async removeParticipant(eventId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('event_participants')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .select('id')

    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  async getParticipants(eventId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('event_participants')
      .select('user_id')
      .eq('event_id', eventId)

    if (error) throw error
    return (data ?? []).map((row) => row.user_id)
  },

  async isParticipant(eventId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('event_participants')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data !== null
  },

  async getUserCreatedEvents(userId: string): Promise<Event[]> {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('creator_id', userId)
      .order('date', { ascending: true })
      .returns<EventRow[]>()

    if (error) throw error
    return data.map(toEvent)
  },

  async getUserParticipatingEvents(userId: string): Promise<Event[]> {
    const { data: participantRows, error: participantError } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('user_id', userId)

    if (participantError) throw participantError

    const eventIds = (participantRows ?? []).map((row) => row.event_id)
    if (eventIds.length === 0) return []

    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .in('id', eventIds)
      .order('date', { ascending: true })
      .returns<EventRow[]>()

    if (error) throw error
    return data.map(toEvent)
  },
}
