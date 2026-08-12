import { query, withTransaction } from '../config/db'
import type { PollStatus } from '../types/poll'

export interface PollRow {
  id: string
  question: string
  status: PollStatus
  ends_at: string | null
  created_by: string
  created_at: string
  published_at: string | null
  finished_at: string | null
}

export interface PollOptionCountRow {
  id: string
  text: string
  position: number
  votes: number
}

const INSERT_OPTIONS = `
  insert into poll_options (poll_id, text, position)
  select $1, opt, ord - 1
  from unnest($2::text[]) with ordinality as t(opt, ord)
`

export const pollsRepository = {
  /** Створює опитування зі status='draft' разом з усіма варіантами в
   * одній транзакції — інакше збій між двома insert лишив би "порожнє"
   * опитування без жодного варіанту. */
  async create(
    question: string,
    options: string[],
    endsAt: string | null,
    createdBy: string,
  ): Promise<string> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into polls (question, ends_at, created_by, status)
         values ($1, $2, $3, 'draft')
         returning id`,
        [question, endsAt, createdBy],
      )
      const pollId = rows[0].id
      await client.query(INSERT_OPTIONS, [pollId, options])
      return pollId
    })
  },

  /** Повна заміна запитання/варіантів/дедлайну — лише для чернетки
   * (status='draft'); якщо опитування вже опубліковане чи завершене,
   * повертає false і нічого не змінює. */
  async update(
    id: string,
    question: string,
    options: string[],
    endsAt: string | null,
  ): Promise<boolean> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `update polls set question = $2, ends_at = $3 where id = $1 and status = 'draft' returning id`,
        [id, question, endsAt],
      )
      if (rows.length === 0) return false
      await client.query('delete from poll_options where poll_id = $1', [id])
      await client.query(INSERT_OPTIONS, [id, options])
      return true
    })
  },

  async findById(id: string): Promise<PollRow | null> {
    const { rows } = await query<PollRow>('select * from polls where id = $1', [id])
    return rows[0] ?? null
  },

  /** Єдине активне опитування, якщо є — той самий unique-індекс у БД
   * гарантує, що воно щонайбільше одне. */
  async findActive(): Promise<PollRow | null> {
    const { rows } = await query<PollRow>("select * from polls where status = 'active' limit 1")
    return rows[0] ?? null
  },

  async listAll(): Promise<PollRow[]> {
    const { rows } = await query<PollRow>('select * from polls order by created_at desc')
    return rows
  },

  async getOptionsWithCounts(pollId: string): Promise<PollOptionCountRow[]> {
    const { rows } = await query<PollOptionCountRow>(
      `select o.id, o.text, o.position, count(v.user_id)::int as votes
       from poll_options o
       left join poll_votes v on v.option_id = o.id
       where o.poll_id = $1
       group by o.id
       order by o.position asc`,
      [pollId],
    )
    return rows
  },

  async getTotalVoters(pollId: string): Promise<number> {
    const { rows } = await query<{ count: number }>(
      'select count(*)::int as count from poll_votes where poll_id = $1',
      [pollId],
    )
    return rows[0].count
  },

  async getMyVote(pollId: string, userId: string): Promise<string | null> {
    const { rows } = await query<{ option_id: string }>(
      'select option_id from poll_votes where poll_id = $1 and user_id = $2',
      [pollId, userId],
    )
    return rows[0]?.option_id ?? null
  },

  /** status: 'draft' → 'active'. Умова в WHERE не дає повторно
   * опублікувати вже активне чи завершене опитування; частковий
   * unique-індекс idx_polls_single_active додатково гарантує, що не
   * можна опублікувати друге, поки перше не завершене (падає
   * unique_violation — обробляється в сервісі). */
  async publish(id: string): Promise<PollRow | null> {
    const { rows } = await query<PollRow>(
      "update polls set status = 'active', published_at = now() where id = $1 and status = 'draft' returning *",
      [id],
    )
    return rows[0] ?? null
  },

  async finish(id: string): Promise<PollRow | null> {
    const { rows } = await query<PollRow>(
      "update polls set status = 'finished', finished_at = now() where id = $1 and status = 'active' returning *",
      [id],
    )
    return rows[0] ?? null
  },

  /** poll_options/poll_votes/poll_broadcasts зникають каскадом (FK ON
   * DELETE CASCADE). */
  async remove(id: string): Promise<boolean> {
    const { rows } = await query('delete from polls where id = $1 returning id', [id])
    return rows.length > 0
  },

  /**
   * Атомарний upsert голосу — єдиний оператор, тож немає вікна між
   * "перевірити, що опитування активне" і "записати голос": INSERT
   * спрацьовує лише якщо опитування активне й варіант справді належить
   * саме йому (WHERE EXISTS), а ON CONFLICT-гілка (зміна вже наявного
   * голосу) додатково звіряє, що опитування й на момент апдейту ще
   * активне. rowCount === 0 означає "не вдалося" — сервіс розбирається,
   * чому саме (немає опитування / не активне / невідомий варіант).
   */
  async vote(pollId: string, optionId: string, userId: string): Promise<boolean> {
    const { rowCount } = await query(
      `insert into poll_votes (poll_id, option_id, user_id)
       select $1, $2, $3
       where exists (
         select 1 from polls p
         join poll_options o on o.poll_id = p.id and o.id = $2
         where p.id = $1 and p.status = 'active'
       )
       on conflict (poll_id, user_id) do update
         set option_id = excluded.option_id, updated_at = now()
         where exists (
           select 1 from polls p2 where p2.id = $1 and p2.status = 'active'
         )`,
      [pollId, optionId, userId],
    )
    return (rowCount ?? 0) > 0
  },
}
