import { query } from '../config/db'
import type { UserRow } from './users.repository'
import type { RegistrationDetail, RegistrationListItem } from '../types/admin'
import type { RegistrationStatus } from '../types/user'

function toListItem(row: UserRow): RegistrationListItem {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    age: row.age ?? undefined,
    faculty: row.faculty ?? undefined,
    registrationStatus: row.registration_status,
    registrationSubmittedAt: row.registration_submitted_at ?? undefined,
  }
}

function toDetail(row: UserRow): RegistrationDetail {
  return {
    ...toListItem(row),
    instagram: row.instagram ?? undefined,
    bio: row.bio ?? undefined,
    registrationReviewedAt: row.registration_reviewed_at ?? undefined,
    registrationReviewedBy: row.registration_reviewed_by ?? undefined,
    registrationRejectionReason: row.registration_rejection_reason ?? undefined,
  }
}

export interface SubmitRegistrationInput {
  age: number
  faculty: string
  instagram: string | null
  bio: string | null
}

export const registrationsRepository = {
  /** Подання чи повторне подання — один атомарний update. Дані заявки й
   * профілю це ті самі колонки users (нема окремої "чорнетки"), тож
   * підтвердження адміном нічого додатково не копіює. Завжди скидає
   * попередню причину відхилення — стара причина не повинна лишатись
   * висіти після виправлення й повторної подачі. */
  async submit(userId: string, input: SubmitRegistrationInput): Promise<UserRow> {
    const { rows } = await query<UserRow>(
      `update users
       set age = $2,
           faculty = $3,
           instagram = $4,
           bio = $5,
           registration_status = 'pending',
           registration_submitted_at = now(),
           registration_rejection_reason = null
       where id = $1
       returning *`,
      [userId, input.age, input.faculty, input.instagram, input.bio],
    )
    return rows[0]
  },

  async findPaginated(
    page: number,
    limit: number,
    status?: RegistrationStatus,
    search?: string,
  ): Promise<{ registrations: RegistrationListItem[]; total: number }> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (status) {
      params.push(status)
      conditions.push(`registration_status = $${params.length}`)
    } else {
      // Без явного фільтру — усі, хто хоч колись подавався. not_submitted
      // не заявка, а стан "ще нічого не надсилав", їм тут не місце.
      conditions.push(`registration_status != 'not_submitted'`)
    }

    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
      params.push(`%${trimmedSearch}%`)
      const idx = params.length
      const nameMatch = `(first_name ilike $${idx} or username ilike $${idx} or faculty ilike $${idx})`
      if (/^\d+$/.test(trimmedSearch)) {
        params.push(trimmedSearch)
        conditions.push(`(${nameMatch} or telegram_id = $${params.length})`)
      } else {
        conditions.push(nameMatch)
      }
    }

    const where = `where ${conditions.join(' and ')}`
    // pending — від найстаріших (адмін розбирає чергу по порядку подачі);
    // approved/rejected/усі разом — від найновіших (щойно вирішене зверху).
    const orderBy = status === 'pending'
      ? 'registration_submitted_at asc nulls last'
      : 'registration_submitted_at desc nulls last'
    const offset = (page - 1) * limit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query<UserRow>(
        `select * from users ${where}
         order by ${orderBy}
         limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query<{ count: string }>(`select count(*) from users ${where}`, params),
    ])

    return { registrations: rows.map(toListItem), total: Number(countRows[0].count) }
  },

  async findById(userId: string): Promise<RegistrationDetail | null> {
    const { rows } = await query<UserRow>('select * from users where id = $1', [userId])
    return rows[0] ? toDetail(rows[0]) : null
  },

  /** Атомарно: переводить у 'approved' лише якщо заявка ще 'pending' —
   * подвійний клік чи паралельне рішення іншого адміна повертає 0 рядків
   * замість тихого повторного застосування. Викликач відрізняє
   * "не знайдено" від "вже вирішено" окремим findById по потребі. */
  async approve(userId: string, reviewerId: string): Promise<RegistrationDetail | null> {
    const { rows } = await query<UserRow>(
      `update users
       set registration_status = 'approved',
           registration_reviewed_at = now(),
           registration_reviewed_by = $2,
           registration_rejection_reason = null
       where id = $1 and registration_status = 'pending'
       returning *`,
      [userId, reviewerId],
    )
    return rows[0] ? toDetail(rows[0]) : null
  },

  async reject(userId: string, reviewerId: string, reason: string | null): Promise<RegistrationDetail | null> {
    const { rows } = await query<UserRow>(
      `update users
       set registration_status = 'rejected',
           registration_reviewed_at = now(),
           registration_reviewed_by = $2,
           registration_rejection_reason = $3
       where id = $1 and registration_status = 'pending'
       returning *`,
      [userId, reviewerId, reason],
    )
    return rows[0] ? toDetail(rows[0]) : null
  },
}
