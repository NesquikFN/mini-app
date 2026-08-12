import { query } from '../config/db'
import type { PollAudience } from '../types/poll'

export interface PollBroadcastRow {
  id: string
  poll_id: string
  audience: PollAudience
  targeted: number
  sent: number
  failed: number
  skipped: number
  started_by: string
  started_at: string
  completed_at: string | null
}

export const pollBroadcastsRepository = {
  async start(pollId: string, audience: PollAudience, targeted: number, startedBy: string): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `insert into poll_broadcasts (poll_id, audience, targeted, started_by)
       values ($1, $2, $3, $4)
       returning id`,
      [pollId, audience, targeted, startedBy],
    )
    return rows[0].id
  },

  async complete(id: string, sent: number, failed: number, skipped: number): Promise<void> {
    await query(
      `update poll_broadcasts set sent = $2, failed = $3, skipped = $4, completed_at = now() where id = $1`,
      [id, sent, failed, skipped],
    )
  },

  /** Останній ЗАВЕРШЕНИЙ запуск розсилки цього опитування (будь-якій
   * аудиторії) — основа і для "показати дату останньої розсилки", і для
   * гейта "повторне надсилання лише після додаткового підтвердження".
   * Незавершені (completed_at is null) не рахуються: якщо процес
   * впав/перезапустився під час розсилки, це не повинно назавжди
   * заблокувати повторний запуск без явного resend. */
  async findLastCompleted(pollId: string): Promise<PollBroadcastRow | null> {
    const { rows } = await query<PollBroadcastRow>(
      `select * from poll_broadcasts
       where poll_id = $1 and completed_at is not null
       order by completed_at desc
       limit 1`,
      [pollId],
    )
    return rows[0] ?? null
  },

  /** chat_id одержувачів, яким це опитування вже було УСПІШНО надіслано
   * (з журналу сповіщень, а не з поточного запуску розсилки) — джерело
   * правди для дедуплікації "не надсилати одному користувачу двічі",
   * дійсне навіть якщо адмін перезапускає розсилку з іншою аудиторією. */
  async findAlreadySentChatIds(pollId: string): Promise<Set<string>> {
    const { rows } = await query<{ chat_id: string }>(
      `select chat_id from notification_log
       where kind = 'poll_broadcast' and poll_id = $1 and success = true`,
      [pollId],
    )
    return new Set(rows.map((row) => row.chat_id))
  },
}
