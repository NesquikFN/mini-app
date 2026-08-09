import { query } from '../config/db'

export type NotificationKind =
  | 'group_announcement'
  | 'personal_announcement'
  | 'event_reminder'
  | 'start_greeting'
  | 'notifications_off_confirmation'
  | 'registration_approved'

export interface NewNotificationLogEntry {
  chatId: string
  kind: NotificationKind
  eventId?: string
  eventTitle?: string
  success: boolean
  errorMessage?: string
}

export interface NotificationLogEntry {
  id: string
  chatId: string
  /** Ім'я одержувача, якщо chat_id збігається з чиїмось telegram_id
   * (приватний DM) — для групових чатів завжди undefined. */
  recipientName?: string
  kind: NotificationKind
  eventId?: string
  eventTitle?: string
  success: boolean
  errorMessage?: string
  createdAt: string
}

interface NotificationLogRow {
  id: string
  chat_id: string
  recipient_name: string | null
  kind: NotificationKind
  event_id: string | null
  event_title: string | null
  success: boolean
  error_message: string | null
  created_at: string
}

function toEntry(row: NotificationLogRow): NotificationLogEntry {
  return {
    id: row.id,
    chatId: row.chat_id,
    recipientName: row.recipient_name ?? undefined,
    kind: row.kind,
    eventId: row.event_id ?? undefined,
    eventTitle: row.event_title ?? undefined,
    success: row.success,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  }
}

// chat_id одержувача тексто́вий і може бути як user_id (позитивний), так
// і id групового чату (від'ємний) — тож приєднуємо users лише за
// текстовим збігом з telegram_id, без спроб парсити chat_id як bigint.
const LIST_SELECT = `
  select nl.*,
    coalesce(u.first_name || coalesce(' ' || u.last_name, ''), null) as recipient_name
  from notification_log nl
  left join users u on u.telegram_id::text = nl.chat_id
`

export const notificationLogRepository = {
  async log(entry: NewNotificationLogEntry): Promise<void> {
    await query(
      `insert into notification_log (chat_id, kind, event_id, event_title, success, error_message)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        entry.chatId,
        entry.kind,
        entry.eventId ?? null,
        entry.eventTitle ?? null,
        entry.success,
        entry.errorMessage ?? null,
      ],
    )
  },

  async listPaginated(
    page: number,
    limit: number,
  ): Promise<{ entries: NotificationLogEntry[]; total: number }> {
    const offset = (page - 1) * limit
    const [{ rows }, { rows: countRows }] = await Promise.all([
      query<NotificationLogRow>(
        `${LIST_SELECT} order by nl.created_at desc limit $1 offset $2`,
        [limit, offset],
      ),
      query<{ count: string }>('select count(*) from notification_log'),
    ])
    return { entries: rows.map(toEntry), total: Number(countRows[0].count) }
  },

  async clear(): Promise<void> {
    await query('delete from notification_log')
  },
}
