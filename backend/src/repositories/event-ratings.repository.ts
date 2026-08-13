import { query, withTransaction } from '../config/db'
import type { EventRatingTag } from '../types/eventRating'

export interface EventRatingRow {
  id: string
  event_id: string
  user_id: string
  organizer_id: string
  rating: number
  created_at: string
  updated_at: string
  moderated_at: string | null
  removed_by: string | null
}

export interface OrganizerParticipationStats {
  completedEvents: number
  totalParticipants: number
}

export interface OrganizerRatingStats {
  ratingsCount: number
  avgRating: number | null
}

const INSERT_TAGS = `
  insert into event_rating_tags (rating_id, tag)
  select $1, unnest($2::text[])
`

export const eventRatingsRepository = {
  async findByEventAndUser(eventId: string, userId: string): Promise<EventRatingRow | null> {
    const { rows } = await query<EventRatingRow>(
      'select * from event_ratings where event_id = $1 and user_id = $2',
      [eventId, userId],
    )
    return rows[0] ?? null
  },

  async getTags(ratingId: string): Promise<EventRatingTag[]> {
    const { rows } = await query<{ tag: EventRatingTag }>(
      'select tag from event_rating_tags where rating_id = $1',
      [ratingId],
    )
    return rows.map((row) => row.tag)
  },

  /**
   * Атомарний upsert — один SQL-оператор, той самий підхід, що й
   * poll_votes у polls.repository.ts. INSERT завжди спрацьовує для
   * першого голосу; ON CONFLICT DO UPDATE застосовується лише коли
   * рядок ще не модерований і не старший за 24 години — інакше ця гілка
   * поводиться як DO NOTHING (Postgres не повертає рядок), і виклик
   * повертає null, щоб сервіс розібрався, чому саме.
   */
  async upsert(
    eventId: string,
    userId: string,
    organizerId: string,
    rating: number,
    tags: EventRatingTag[],
  ): Promise<string | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into event_ratings (event_id, user_id, organizer_id, rating)
         values ($1, $2, $3, $4)
         on conflict (event_id, user_id) do update
           set rating = excluded.rating, updated_at = now()
           where event_ratings.moderated_at is null
             and event_ratings.created_at >= now() - interval '24 hours'
         returning id`,
        [eventId, userId, organizerId, rating],
      )
      if (rows.length === 0) return null

      const ratingId = rows[0].id
      await client.query('delete from event_rating_tags where rating_id = $1', [ratingId])
      if (tags.length > 0) {
        await client.query(INSERT_TAGS, [ratingId, tags])
      }
      return ratingId
    })
  },

  /** Повний список оцінок події для адмінки — без анонімізації (ім'я
   * автора видно), включно з уже модерованими (щоб адмін бачив і міг
   * відновити). */
  async listForEvent(eventId: string): Promise<
    Array<EventRatingRow & { first_name: string; nickname: string | null; tags: EventRatingTag[] }>
  > {
    const { rows } = await query<
      EventRatingRow & { first_name: string; nickname: string | null }
    >(
      `select er.*, u.first_name, u.nickname
       from event_ratings er
       join users u on u.id = er.user_id
       where er.event_id = $1
       order by er.created_at desc`,
      [eventId],
    )
    if (rows.length === 0) return []

    const { rows: tagRows } = await query<{ rating_id: string; tag: EventRatingTag }>(
      `select rating_id, tag from event_rating_tags where rating_id = any($1)`,
      [rows.map((row) => row.id)],
    )
    const tagsByRating = new Map<string, EventRatingTag[]>()
    for (const tagRow of tagRows) {
      const list = tagsByRating.get(tagRow.rating_id) ?? []
      list.push(tagRow.tag)
      tagsByRating.set(tagRow.rating_id, list)
    }

    return rows.map((row) => ({ ...row, tags: tagsByRating.get(row.id) ?? [] }))
  },

  /** Виключення підозрілої оцінки з рейтингу — рядок лишається (адмін
   * і надалі бачить, хто й що оцінив), лише перестає враховуватись у
   * жодній агрегації репутації. */
  async moderate(ratingId: string, adminId: string): Promise<boolean> {
    const { rowCount } = await query(
      'update event_ratings set moderated_at = now(), removed_by = $2 where id = $1 and moderated_at is null',
      [ratingId, adminId],
    )
    return (rowCount ?? 0) > 0
  },

  async restore(ratingId: string): Promise<boolean> {
    const { rowCount } = await query(
      'update event_ratings set moderated_at = null, removed_by = null where id = $1 and moderated_at is not null',
      [ratingId],
    )
    return (rowCount ?? 0) > 0
  },

  /**
   * Скільки завершених подій провів кожен із organizerIds і скільки
   * всього учасників (не "прийшло" — лише зареєстрована участь, див.
   * обмеження в event-ratings.service.ts) було в цих подіях. Один
   * batch-запит на довільну кількість організаторів — та сама техніка,
   * що й findParticipantPreviews в events.repository.ts.
   */
  async getOrganizerParticipationStats(
    organizerIds: string[],
    nowTs: string,
  ): Promise<Map<string, OrganizerParticipationStats>> {
    const stats = new Map<string, OrganizerParticipationStats>()
    if (organizerIds.length === 0) return stats

    const { rows } = await query<{ creator_id: string; completed_events: string; total_participants: string }>(
      `select e.creator_id,
         count(distinct e.id) as completed_events,
         count(ep.user_id) as total_participants
       from events e
       left join event_participants ep on ep.event_id = e.id
       where e.creator_id = any($1) and (e.date + e.time) <= $2::timestamp
       group by e.creator_id`,
      [organizerIds, nowTs],
    )
    for (const row of rows) {
      stats.set(row.creator_id, {
        completedEvents: Number(row.completed_events),
        totalParticipants: Number(row.total_participants),
      })
    }
    return stats
  },

  async getOrganizerRatingStats(organizerIds: string[]): Promise<Map<string, OrganizerRatingStats>> {
    const stats = new Map<string, OrganizerRatingStats>()
    if (organizerIds.length === 0) return stats

    const { rows } = await query<{ organizer_id: string; ratings_count: string; avg_rating: string | null }>(
      `select organizer_id, count(*) as ratings_count, avg(rating) as avg_rating
       from event_ratings
       where organizer_id = any($1) and moderated_at is null
       group by organizer_id`,
      [organizerIds],
    )
    for (const row of rows) {
      stats.set(row.organizer_id, {
        ratingsCount: Number(row.ratings_count),
        avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
      })
    }
    return stats
  },

  async getTopTags(organizerId: string, limit = 3): Promise<EventRatingTag[]> {
    const { rows } = await query<{ tag: EventRatingTag }>(
      `select ert.tag
       from event_rating_tags ert
       join event_ratings er on er.id = ert.rating_id
       where er.organizer_id = $1 and er.moderated_at is null
       group by ert.tag
       order by count(*) desc, ert.tag asc
       limit $2`,
      [organizerId, limit],
    )
    return rows.map((row) => row.tag)
  },

  /** Розподіл оцінок 1..5 для адмінського профілю користувача. */
  async getRatingDistribution(organizerId: string): Promise<[number, number, number, number, number]> {
    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0]
    const { rows } = await query<{ rating: number; count: string }>(
      `select rating, count(*) as count
       from event_ratings
       where organizer_id = $1 and moderated_at is null
       group by rating`,
      [organizerId],
    )
    for (const row of rows) {
      if (row.rating >= 1 && row.rating <= 5) distribution[row.rating - 1] = Number(row.count)
    }
    return distribution
  },

  /** Події, що завершились у вікні [nowTs - 60хв, nowTs - 30хв] і ще не
   * отримали нагадування оцінити. Дзеркальне до findDueForReminder у
   * events.repository.ts вікно — там "до старту", тут "після завершення". */
  async findDueForRatingRequest(
    windowStartTs: string,
    windowEndTs: string,
  ): Promise<Array<{ id: string; title: string; creator_id: string; date: string; time: string; is_vip_only: boolean; is_gpu_only: boolean }>> {
    const { rows } = await query<{
      id: string
      title: string
      creator_id: string
      date: string
      time: string
      is_vip_only: boolean
      is_gpu_only: boolean
    }>(
      `select id, title, creator_id, date, time, is_vip_only, is_gpu_only
       from events
       where rating_reminder_sent_at is null
         and (date + time) > $1::timestamp
         and (date + time) <= $2::timestamp`,
      [windowStartTs, windowEndTs],
    )
    return rows
  },

  async markRatingReminderSent(eventId: string): Promise<void> {
    await query('update events set rating_reminder_sent_at = now() where id = $1', [eventId])
  },

  /**
   * Отримувачі нагадування "Як пройшла подія?": учасники, крім
   * організатора, крім тих, хто вже оцінив (навіть якщо оцінку потім
   * модерували — вони вже дали відгук), схвалені й незаблоковані. Той
   * самий requiredRole-джойн, що й getParticipantTelegramIds в
   * events.repository.ts — щоб не написати тому, хто втратив VIP/ГПУ
   * вже після приєднання до закритої події.
   */
  async getRatingRequestTelegramIds(
    eventId: string,
    organizerId: string,
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
         and ep.user_id <> $2
         and u.registration_status = 'approved'
         and u.banned_permanently = false
         and (u.banned_until is null or u.banned_until <= now())
         and not exists (
           select 1 from event_ratings er where er.event_id = $1 and er.user_id = ep.user_id
         )`,
      [eventId, organizerId],
    )
    return rows.map((row) => Number(row.telegram_id))
  },
}
