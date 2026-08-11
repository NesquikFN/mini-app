import { query } from '../config/db'
import { AppError } from '../utils/AppError'
import { addDays, todayISODate, toISODate } from '../utils/date'
import type { Event } from '../types/event'
import type { PublicUser } from '../types/user'

export type EventDateFilter = 'today' | 'week' | 'all'

interface EventRow {
  id: string
  creator_id: string
  title: string
  description: string | null
  image_url: string | null
  group_url: string | null
  game_url: string | null
  is_online: boolean
  is_vip_only: boolean
  is_gpu_only: boolean
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
  gameUrl?: string
  isOnline: boolean
  vipOnly: boolean
  gpuOnly: boolean
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
    gameUrl: row.game_url ?? undefined,
    isOnline: row.is_online,
    vipOnly: row.is_vip_only,
    gpuOnly: row.is_gpu_only,
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
  if (message.includes('EVENT_VIP_REQUIRED')) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (message.includes('EVENT_GPU_REQUIRED')) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  throw error
}

/** Помилки join_event_waitlist. EVENT_NOT_FULL не помилка для клієнта:
 * сервіс перехоплює його окремо й робить звичайне приєднання. */
export class EventNotFullError extends Error {}

function translateWaitlistError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('EVENT_NOT_FULL')) {
    throw new EventNotFullError('EVENT_NOT_FULL')
  }
  if (message.includes('EVENT_NOT_FOUND')) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (message.includes('ALREADY_JOINED')) {
    throw new AppError(409, 'ALREADY_JOINED', 'Ви вже берете участь у цій події')
  }
  if (message.includes('ALREADY_WAITLISTED')) {
    throw new AppError(409, 'ALREADY_WAITLISTED', 'Ви вже в черзі на цю подію')
  }
  // Втратив роль/доступ між відкриттям сторінки й натисканням — та сама
  // «подію не знайдено», що й скрізь, щоб не розкривати причину.
  if (message.includes('EVENT_ACCESS_DENIED')) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  throw error
}

export const eventsRepository = {
  /** dormitoryId — необов'язковий server-side фільтр (звідки саме він
   * узятий і чи довіряти йому, вирішує events.service, не тут). Без
   * нього — усі гуртожитки. */
  async findAll(
    dormitoryId?: string,
    includeVip = false,
    onlineOnly = false,
    includeGpu = false,
  ): Promise<Event[]> {
    // Physical events stay scoped to the selected dormitory, while
    // online events are global and must be visible to everyone.
    const conditions: string[] = []
    const params: unknown[] = []
    if (dormitoryId) {
      params.push(dormitoryId)
      conditions.push(`(e.dormitory_id = $${params.length} or e.is_online = true)`)
    }
    if (onlineOnly) conditions.push('e.is_online = true')
    if (!includeVip) conditions.push('e.is_vip_only = false')
    if (!includeGpu) conditions.push('e.is_gpu_only = false')
    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''
    const { rows } = await query<EventRow>(
      `${EVENTS_BASE_SELECT} ${where} group by e.id order by e.date asc`,
      params,
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
         (creator_id, title, description, image_url, group_url, game_url, is_online,
          is_vip_only, is_gpu_only, date, time, location, max_participants, dormitory_id, source_template_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       returning id`,
      [
        newEvent.creatorId,
        newEvent.title,
        newEvent.description || null,
        newEvent.imageUrl || null,
        newEvent.groupUrl || null,
        newEvent.gameUrl || null,
        newEvent.isOnline,
        newEvent.vipOnly,
        newEvent.gpuOnly,
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
    if (patch.gameUrl !== undefined) columns.game_url = patch.gameUrl || null
    if (patch.isOnline !== undefined) columns.is_online = patch.isOnline
    if (patch.vipOnly !== undefined) columns.is_vip_only = patch.vipOnly
    if (patch.gpuOnly !== undefined) columns.is_gpu_only = patch.gpuOnly
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

  /** Вступ до черги. Уся перевірка (заповненість, ролі, дублі) —
   * усередині PostgreSQL-функції під `for update` на рядку події, тож
   * два одночасні вступи не можуть дати ні дубля, ні однакової позиції. */
  async joinWaitlist(eventId: string, userId: string): Promise<number> {
    try {
      const { rows } = await query<{ join_event_waitlist: number }>(
        'select join_event_waitlist($1, $2)',
        [eventId, userId],
      )
      return rows[0].join_event_waitlist
    } catch (error) {
      translateWaitlistError(error)
    }
  },

  async leaveWaitlist(eventId: string, userId: string): Promise<boolean> {
    const { rows } = await query<{ leave_event_waitlist: boolean }>(
      'select leave_event_waitlist($1, $2)',
      [eventId, userId],
    )
    return rows[0].leave_event_waitlist
  },

  /**
   * Атомарне просування черги після звільнення місця. Повертає id тих,
   * кого перевели в учасники, — сервіс шле їм DM уже після того, як
   * транзакція функції закомітилась, тож збій Telegram нічого не
   * відкочує.
   */
  async promoteFromWaitlist(eventId: string): Promise<string[]> {
    const { rows } = await query<{ promote_event_waitlist: string[] | null }>(
      'select promote_event_waitlist($1)',
      [eventId],
    )
    return rows[0]?.promote_event_waitlist ?? []
  },

  async getWaitlistCount(eventId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      'select count(*) from event_waitlist where event_id = $1',
      [eventId],
    )
    return Number(rows[0].count)
  },

  /** Позиція користувача в черзі (1-based) або null, якщо його там нема.
   * Порядок той самий, що й у SQL-функціях: (created_at, id). */
  async getWaitlistPosition(eventId: string, userId: string): Promise<number | null> {
    const { rows } = await query<{ position: string }>(
      `select count(*) as position
       from event_waitlist w
       where w.event_id = $1
         and (w.created_at, w.id) <= (
           select w2.created_at, w2.id from event_waitlist w2
           where w2.event_id = $1 and w2.user_id = $2
         )`,
      [eventId, userId],
    )
    const position = Number(rows[0].position)
    return position > 0 ? position : null
  },

  /** Впорядкований список id у черзі — лише для організатора й адміна
   * (звичайному користувачеві сервіс його не віддає). */
  async getWaitlistUserIds(eventId: string): Promise<string[]> {
    const { rows } = await query<{ user_id: string }>(
      `select user_id from event_waitlist
       where event_id = $1
       order by created_at asc, id asc`,
      [eventId],
    )
    return rows.map((row) => row.user_id)
  },

  /** Кількість у черзі одразу для списку подій — один запит замість
   * N+1, той самий підхід, що й findParticipantPreviews. */
  async findWaitlistCounts(eventIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (eventIds.length === 0) return counts

    const { rows } = await query<{ event_id: string; count: string }>(
      `select event_id, count(*) as count from event_waitlist
       where event_id = any($1) group by event_id`,
      [eventIds],
    )
    for (const row of rows) counts.set(row.event_id, Number(row.count))
    return counts
  },

  /** Позиції поточного глядача в чергах одразу для списку подій. */
  async findWaitlistPositions(
    eventIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    const positions = new Map<string, number>()
    if (eventIds.length === 0) return positions

    const { rows } = await query<{ event_id: string; position: string }>(
      `select event_id, position from (
         select w.event_id, w.user_id,
           row_number() over (partition by w.event_id order by w.created_at asc, w.id asc) as position
         from event_waitlist w
         where w.event_id = any($1)
       ) ranked
       where ranked.user_id = $2`,
      [eventIds, userId],
    )
    for (const row of rows) positions.set(row.event_id, Number(row.position))
    return positions
  },

  /** Події, у яких користувач є учасником — потрібні перед видаленням
   * користувача, щоб після каскаду просунути чергу саме в них. */
  async findEventIdsWithParticipant(userId: string): Promise<string[]> {
    const { rows } = await query<{ event_id: string }>(
      'select event_id from event_participants where user_id = $1',
      [userId],
    )
    return rows.map((row) => row.event_id)
  },

  async getParticipants(eventId: string): Promise<string[]> {
    const { rows } = await query<{ user_id: string }>(
      'select user_id from event_participants where event_id = $1',
      [eventId],
    )
    return rows.map((row) => row.user_id)
  },

  /** Отримувачі нагадування про подію. Забанені й несхвалені
   * відсіюються так само, як у getSubscribedTelegramIds — бот не пише
   * тим, кому доступ до застосунку закрито. `requiredRole` — захист "про
   * всяк випадок" на випадок, якщо роль знято вже після приєднання до
   * закритої події: подія ніколи не буває одночасно vip і gpu, тож лише
   * одне з двох джойнів застосовується. */
  async getParticipantTelegramIds(
    eventId: string,
    requiredRole?: 'vip' | 'gpu',
  ): Promise<number[]> {
    const roleJoin =
      requiredRole === 'vip'
        ? 'join vip_users v on v.user_id = u.id'
        : requiredRole === 'gpu'
          ? 'join gpu_users g on g.user_id = u.id'
          : ''
    const { rows } = await query<{ telegram_id: string }>(
      `select u.telegram_id from event_participants ep
       join users u on u.id = ep.user_id
       ${roleJoin}
       where ep.event_id = $1
         and u.registration_status = 'approved'
         and u.banned_permanently = false
         and (u.banned_until is null or u.banned_until <= now())`,
      [eventId],
    )
    return rows.map((row) => Number(row.telegram_id))
  },

  /** Події, що стартують у вікні (nowTs, nowTs + windowMinutes] і ще не
   * отримали нагадування. `date`/`time` — наївні (без tz) колонки, тож
   * $1/$2 передаються як наївні timestamp-рядки в київському "стінному"
   * часі (див. utils/kyivTime.ts) — жодної tz-математики на боці Postgres. */
  async findDueForReminder(nowTs: string, windowEndTs: string): Promise<Event[]> {
    const { rows } = await query<EventRow>(
      `${EVENTS_BASE_SELECT}
       where e.reminder_sent_at is null
         and (e.date + e.time) > $1::timestamp
         and (e.date + e.time) <= $2::timestamp
       group by e.id`,
      [nowTs, windowEndTs],
    )
    return rows.map(toEvent)
  },

  async markReminderSent(eventId: string): Promise<void> {
    await query('update events set reminder_sent_at = now() where id = $1', [eventId])
  },

  /**
   * Batch fetch of the first `limit` participants per event, keyed by
   * event id — used to show avatar-stack previews on event cards without
   * an N+1 (one query total, regardless of how many event ids are
   * passed). `row_number() over (partition by event_id ...)` ranks each
   * event's own participants by join order (ep.created_at, same column
   * join_event() stamps), and the outer filter keeps only the first
   * `limit` per partition — the Postgres-native way to do a per-group
   * "top N" in a single query instead of N separate limited queries.
   */
  async findParticipantPreviews(
    eventIds: string[],
    limit = 3,
  ): Promise<Map<string, PublicUser[]>> {
    const byEvent = new Map<string, PublicUser[]>()
    if (eventIds.length === 0) return byEvent

    const { rows } = await query<{
      event_id: string
      id: string
      first_name: string
      username: string | null
      photo_url: string | null
      nickname: string | null
    }>(
      `select event_id, id, first_name, username, photo_url, nickname
       from (
         select
           ep.event_id,
           u.id,
           u.first_name,
           u.username,
           u.photo_url,
           u.nickname,
           row_number() over (partition by ep.event_id order by ep.created_at asc) as rn
         from event_participants ep
         join users u on u.id = ep.user_id
         where ep.event_id = any($1)
       ) ranked
       where rn <= $2`,
      [eventIds, limit],
    )

    for (const row of rows) {
      const preview = byEvent.get(row.event_id) ?? []
      preview.push({
        id: row.id,
        firstName: row.first_name,
        username: row.username ?? undefined,
        photoUrl: row.photo_url ?? undefined,
        nickname: row.nickname ?? undefined,
      })
      byEvent.set(row.event_id, preview)
    }
    return byEvent
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
