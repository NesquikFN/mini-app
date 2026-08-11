import { query } from '../config/db'
import type { QuickPlan, QuickPlanCategory } from '../types/quick-plan'

interface QuickPlanRow {
  id: string
  creator_id: string
  text: string
  category: QuickPlanCategory
  is_online: boolean
  dormitory_id: string | null
  expires_at: string
  created_at: string
  participant_ids: string[]
}

export interface NewQuickPlan {
  creatorId: string
  text: string
  category: QuickPlanCategory
  isOnline: boolean
  /** null для онлайн-плану. Значення завжди походить з users.dormitory_id
   * автора (quick-plans.service.ts), ніколи з тіла запиту. */
  dormitoryId: string | null
  expiresAt: string
}

/** Учасники агрегуються тим самим LEFT JOIN + array_agg, що й у
 * events.repository — один запит замість N+1 на кожен план. */
const PLANS_BASE_SELECT = `
  select p.*,
    coalesce(array_agg(pp.user_id order by pp.created_at asc)
      filter (where pp.user_id is not null), '{}') as participant_ids
  from quick_plans p
  left join quick_plan_participants pp on pp.plan_id = p.id
`

/** Прострочені плани не існують для API — фільтр стоїть у кожному
 * читанні, тож коректність не залежить від фонового cleanup. */
const NOT_EXPIRED = 'p.expires_at > now()'

export interface QuickPlanWithParticipants extends QuickPlan {
  participantIds: string[]
}

function toPlan(row: QuickPlanRow): QuickPlanWithParticipants {
  return {
    id: row.id,
    creatorId: row.creator_id,
    text: row.text,
    category: row.category,
    isOnline: row.is_online,
    dormitoryId: row.dormitory_id ?? undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    participantIds: row.participant_ids,
  }
}

export const quickPlansRepository = {
  /**
   * Активні плани, доступні глядачеві: усі онлайн-плани плюс офлайн-плани
   * його власного гуртожитку. Фільтр видимості живе саме тут, у SQL, а не
   * після вибірки — інакше чужі плани встигали б потрапити в пам'ять
   * процесу й могли б протекти в якусь наступну відповідь.
   */
  async findVisible(dormitoryId?: string): Promise<QuickPlanWithParticipants[]> {
    const params: unknown[] = []
    let visibility = 'p.is_online = true'
    if (dormitoryId) {
      params.push(dormitoryId)
      visibility = `(p.is_online = true or p.dormitory_id = $${params.length})`
    }

    const { rows } = await query<QuickPlanRow>(
      `${PLANS_BASE_SELECT}
       where ${NOT_EXPIRED} and ${visibility}
       group by p.id
       order by p.created_at desc`,
      params,
    )
    return rows.map(toPlan)
  },

  /** Один активний план без перевірки видимості — її робить сервіс,
   * щоб відрізнити «немає» від «є, але не для тебе» і в обох випадках
   * відповісти однаково (404). */
  async findById(id: string): Promise<QuickPlanWithParticipants | null> {
    const { rows } = await query<QuickPlanRow>(
      `${PLANS_BASE_SELECT} where p.id = $1 and ${NOT_EXPIRED} group by p.id`,
      [id],
    )
    return rows[0] ? toPlan(rows[0]) : null
  },

  /** Останні активні плани для адмін-огляду — без фільтра гуртожитку
   * (адмін бачить усі) і з окремим лічильником загальної кількості. */
  async findRecentActive(limit: number): Promise<{ plans: QuickPlanWithParticipants[]; total: number }> {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      query<QuickPlanRow>(
        `${PLANS_BASE_SELECT}
         where ${NOT_EXPIRED}
         group by p.id
         order by p.created_at desc
         limit $1`,
        [limit],
      ),
      query<{ count: string }>(`select count(*) from quick_plans p where ${NOT_EXPIRED}`),
    ])
    return { plans: rows.map(toPlan), total: Number(countRows[0].count) }
  },

  /** Скільки активних планів уже має автор — межа проти спаму. */
  async countActiveByCreator(creatorId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `select count(*) from quick_plans p where p.creator_id = $1 and ${NOT_EXPIRED}`,
      [creatorId],
    )
    return Number(rows[0].count)
  },

  async insert(plan: NewQuickPlan): Promise<QuickPlanWithParticipants> {
    const { rows } = await query<{ id: string }>(
      `insert into quick_plans (creator_id, text, category, is_online, dormitory_id, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        plan.creatorId,
        plan.text,
        plan.category,
        plan.isOnline,
        plan.dormitoryId,
        plan.expiresAt,
      ],
    )

    const created = await quickPlansRepository.findById(rows[0].id)
    if (!created) {
      throw new Error('Не вдалося прочитати щойно створений швидкий план')
    }
    return created
  },

  async remove(id: string): Promise<boolean> {
    // quick_plan_participants зникають каскадом (FK ON DELETE CASCADE).
    const { rows } = await query('delete from quick_plans where id = $1 returning id', [id])
    return rows.length > 0
  },

  /**
   * Ідемпотентний відгук: unique (plan_id, user_id) + on conflict do
   * nothing означає, що повторний «Я з вами» не створює дубль і не падає
   * помилкою. Повертає true лише коли рядок справді з'явився — саме за
   * цим сервіс вирішує, чи слати автору DM (повторний join мовчить).
   */
  async addParticipant(planId: string, userId: string): Promise<boolean> {
    const { rows } = await query(
      `insert into quick_plan_participants (plan_id, user_id)
       values ($1, $2)
       on conflict (plan_id, user_id) do nothing
       returning id`,
      [planId, userId],
    )
    return rows.length > 0
  },

  async removeParticipant(planId: string, userId: string): Promise<boolean> {
    const { rows } = await query(
      'delete from quick_plan_participants where plan_id = $1 and user_id = $2 returning id',
      [planId, userId],
    )
    return rows.length > 0
  },

  /** Фоновий прибиральник простроченого. Система на нього не
   * покладається (кожне читання й так фільтрує expires_at) — це лише
   * гігієна таблиці. */
  async deleteExpired(): Promise<number> {
    const { rowCount } = await query('delete from quick_plans where expires_at <= now()')
    return rowCount ?? 0
  },
}
