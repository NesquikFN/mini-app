/**
 * Інтеграційні тести черги проти СПРАВЖНЬОГО PostgreSQL — саме тут
 * перевіряється те, що неможливо перевірити моками: атомарність
 * promote_event_waitlist під конкурентним навантаженням, FIFO-порядок і
 * те, що кількість учасників ніколи не перевищує ліміт.
 *
 * БЕЗПЕКА: цей файл НІКОЛИ не використовує DATABASE_URL застосунку
 * (у розробника він вказує на production Railway). Потрібна окрема
 * тестова база через WAITLIST_TEST_DATABASE_URL; без неї весь набір
 * тихо пропускається. Пул створюється власний, тож навіть випадково
 * звернутись до production-пулу застосунку тут неможливо.
 *
 * Локальний запуск:
 *   createdb waitlist_test && psql -d waitlist_test -f database/schema.sql
 *   WAITLIST_TEST_DATABASE_URL=postgresql://... npm run test:integration
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const TEST_DATABASE_URL = process.env.WAITLIST_TEST_DATABASE_URL

/** Захист від пострілу собі в ногу: навіть якщо змінну виставлять на
 * production-рядок, тести не запустяться. */
const looksLikeProduction =
  TEST_DATABASE_URL?.includes('railway') || TEST_DATABASE_URL?.includes('rlwy.net')

const shouldRun = Boolean(TEST_DATABASE_URL) && !looksLikeProduction

const DORM = '00000000-0000-0000-0000-000000000101'
const NO_DORM = '00000000-0000-0000-0000-000000000100'

describe('event waitlist against a real PostgreSQL', { skip: !shouldRun }, () => {
  let pool: pg.Pool
  let eventId: string
  const userIds: string[] = []

  async function resetFixture(maxParticipants: number, overrides: Record<string, unknown> = {}) {
    await pool.query('delete from event_waitlist where event_id = $1', [eventId])
    await pool.query('delete from event_participants where event_id = $1', [eventId])
    await pool.query(
      `update events set max_participants = $2, is_vip_only = $3, is_gpu_only = $4
       where id = $1`,
      [eventId, maxParticipants, overrides.vipOnly ?? false, overrides.gpuOnly ?? false],
    )
  }

  async function participantCount(): Promise<number> {
    const { rows } = await pool.query('select count(*) from event_participants where event_id = $1', [
      eventId,
    ])
    return Number(rows[0].count)
  }

  async function waitlistUserIds(): Promise<string[]> {
    const { rows } = await pool.query<{ user_id: string }>(
      'select user_id from event_waitlist where event_id = $1 order by created_at asc, id asc',
      [eventId],
    )
    return rows.map((row) => row.user_id)
  }

  before(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })

    // 12 користувачів: 0 — організатор, решта учасники/охочі.
    for (let index = 0; index < 12; index += 1) {
      const { rows } = await pool.query<{ id: string }>(
        `insert into users (telegram_id, first_name, registration_status, dormitory_id)
         values ($1, $2, 'approved', $3)
         on conflict (telegram_id) do update set first_name = excluded.first_name
         returning id`,
        [990_000_000 + index, `WaitlistUser${index}`, DORM],
      )
      userIds.push(rows[0].id)
    }

    const { rows } = await pool.query<{ id: string }>(
      `insert into events (creator_id, title, date, time, location, max_participants, dormitory_id)
       values ($1, 'Waitlist integration event', '2099-01-01', '18:00', 'Hall', 2, $2)
       returning id`,
      [userIds[0], DORM],
    )
    eventId = rows[0].id
  })

  after(async () => {
    if (!pool) return
    await pool.query('delete from events where id = $1', [eventId])
    await pool.query('delete from users where id = any($1)', [userIds])
    await pool.end()
  })

  it('keeps FIFO order and reports the right positions', async () => {
    await resetFixture(2)
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])

    for (const index of [2, 3, 4]) {
      const { rows } = await pool.query<{ join_event_waitlist: number }>(
        'select join_event_waitlist($1, $2)',
        [eventId, userIds[index]],
      )
      assert.equal(rows[0].join_event_waitlist, index - 1, `user ${index} position`)
    }

    assert.deepEqual(await waitlistUserIds(), [userIds[2], userIds[3], userIds[4]])
  })

  it('promotes exactly one person per freed seat, in order', async () => {
    await pool.query('delete from event_participants where event_id = $1 and user_id = $2', [
      eventId,
      userIds[1],
    ])
    const { rows } = await pool.query<{ promote_event_waitlist: string[] }>(
      'select promote_event_waitlist($1)',
      [eventId],
    )

    assert.deepEqual(rows[0].promote_event_waitlist, [userIds[2]], 'the first waiter goes in')
    assert.equal(await participantCount(), 2)
    assert.deepEqual(await waitlistUserIds(), [userIds[3], userIds[4]])
  })

  it('refuses a direct join that would jump the queue', async () => {
    await pool.query('delete from event_participants where event_id = $1 and user_id = $2', [
      eventId,
      userIds[2],
    ])
    // Місце вільне, але в черзі стоять люди — сторонній не проходить.
    await assert.rejects(
      () => pool.query('select join_event($1, $2)', [eventId, userIds[9]]),
      /EVENT_FULL/,
    )
    // А перший у черзі — проходить, і його запис зникає.
    await pool.query('select join_event($1, $2)', [eventId, userIds[3]])
    assert.deepEqual(await waitlistUserIds(), [userIds[4]])
  })

  it('promotes several people at once when the limit grows', async () => {
    await resetFixture(2)
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])
    for (const index of [2, 3, 4, 5]) {
      await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[index]])
    }

    await pool.query('update events set max_participants = 5 where id = $1', [eventId])
    const { rows } = await pool.query<{ promote_event_waitlist: string[] }>(
      'select promote_event_waitlist($1)',
      [eventId],
    )

    assert.deepEqual(rows[0].promote_event_waitlist, [userIds[2], userIds[3], userIds[4]])
    assert.equal(await participantCount(), 5)
    assert.deepEqual(await waitlistUserIds(), [userIds[5]], 'the 4th waiter still waits')
  })

  it('skips and prunes a waiter who lost access, promoting the next valid one', async () => {
    await resetFixture(2, { vipOnly: true })
    // Організатор і ще один — VIP, щоб узагалі потрапити в подію.
    await pool.query(
      `insert into vip_users (user_id) select unnest($1::uuid[])
       on conflict (user_id) do nothing`,
      [[userIds[0], userIds[1], userIds[7]]],
    )
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])

    // userIds[6] — VIP на момент вступу в чергу, потім роль знімають.
    await pool.query('insert into vip_users (user_id) values ($1) on conflict do nothing', [
      userIds[6],
    ])
    await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[6]])
    await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[7]])
    await pool.query('delete from vip_users where user_id = $1', [userIds[6]])

    await pool.query('delete from event_participants where event_id = $1 and user_id = $2', [
      eventId,
      userIds[1],
    ])
    const { rows } = await pool.query<{ promote_event_waitlist: string[] }>(
      'select promote_event_waitlist($1)',
      [eventId],
    )

    assert.deepEqual(rows[0].promote_event_waitlist, [userIds[7]], 'the ex-VIP is skipped')
    assert.deepEqual(await waitlistUserIds(), [], 'the invalid entry is pruned, not left behind')

    await pool.query('delete from vip_users where user_id = any($1)', [userIds])
  })

  it('skips a banned waiter and one whose registration was revoked', async () => {
    await resetFixture(2)
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])

    await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[8]])
    await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[9]])
    await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[10]])
    await pool.query('update users set banned_permanently = true where id = $1', [userIds[8]])
    await pool.query("update users set registration_status = 'pending' where id = $1", [userIds[9]])

    await pool.query('delete from event_participants where event_id = $1 and user_id = $2', [
      eventId,
      userIds[1],
    ])
    const { rows } = await pool.query<{ promote_event_waitlist: string[] }>(
      'select promote_event_waitlist($1)',
      [eventId],
    )

    assert.deepEqual(rows[0].promote_event_waitlist, [userIds[10]])

    await pool.query('update users set banned_permanently = false where id = $1', [userIds[8]])
    await pool.query("update users set registration_status = 'approved' where id = $1", [userIds[9]])
  })

  it('refuses to queue a user with no dormitory for an offline event', async () => {
    await resetFixture(2)
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])
    await pool.query('update events set is_online = false where id = $1', [eventId])
    await pool.query('update users set dormitory_id = $2 where id = $1', [userIds[11], NO_DORM])

    await assert.rejects(
      () => pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[11]]),
      /EVENT_ACCESS_DENIED/,
    )

    await pool.query('update users set dormitory_id = $2 where id = $1', [userIds[11], DORM])
  })

  // --- Конкурентність ------------------------------------------------

  it('CONCURRENCY: 8 simultaneous waitlist joins produce 8 distinct positions', async () => {
    await resetFixture(2)
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])

    const contenders = userIds.slice(2, 10)
    const results = await Promise.all(
      contenders.map(async (userId) => {
        const { rows } = await pool.query<{ join_event_waitlist: number }>(
          'select join_event_waitlist($1, $2)',
          [eventId, userId],
        )
        return rows[0].join_event_waitlist
      }),
    )

    assert.deepEqual(
      [...results].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8],
      'every concurrent joiner must get its own position, with no gaps or duplicates',
    )
    assert.equal((await waitlistUserIds()).length, 8)
  })

  it('CONCURRENCY: simultaneous promotions never exceed max_participants', async () => {
    // Черга з 8 людей, ліміт 2 → звільняємо обидва місця й запускаємо
    // 6 паралельних просувань. Правильний результат — рівно 2 учасники.
    await pool.query('delete from event_participants where event_id = $1', [eventId])

    const promotions = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const { rows } = await pool.query<{ promote_event_waitlist: string[] }>(
          'select promote_event_waitlist($1)',
          [eventId],
        )
        return rows[0].promote_event_waitlist
      }),
    )

    const promoted = promotions.flat()
    assert.equal(await participantCount(), 2, 'participants must never exceed max_participants')
    assert.equal(promoted.length, 2, 'exactly two people may be promoted into two seats')
    assert.equal(new Set(promoted).size, 2, 'nobody may be promoted twice')
    // Просунулись саме перші двоє з черги.
    assert.deepEqual(promoted.sort(), [userIds[2], userIds[3]].sort())
  })

  it('CONCURRENCY: a direct join racing a promotion cannot steal the seat', async () => {
    await resetFixture(2)
    await pool.query('select join_event($1, $2)', [eventId, userIds[0]])
    await pool.query('select join_event($1, $2)', [eventId, userIds[1]])
    await pool.query('select join_event_waitlist($1, $2)', [eventId, userIds[2]])

    await pool.query('delete from event_participants where event_id = $1 and user_id = $2', [
      eventId,
      userIds[1],
    ])

    // Стороннє пряме приєднання паралельно з просуванням черги.
    const [promotion, directJoin] = await Promise.allSettled([
      pool.query<{ promote_event_waitlist: string[] }>('select promote_event_waitlist($1)', [
        eventId,
      ]),
      pool.query('select join_event($1, $2)', [eventId, userIds[9]]),
    ])

    assert.equal(promotion.status, 'fulfilled')
    assert.equal(directJoin.status, 'rejected', 'the outsider must be refused')

    const { rows } = await pool.query<{ user_id: string }>(
      'select user_id from event_participants where event_id = $1',
      [eventId],
    )
    const participants = rows.map((row) => row.user_id)
    assert.equal(participants.length, 2)
    assert.ok(participants.includes(userIds[2]), 'the seat belongs to the first waiter')
    assert.ok(!participants.includes(userIds[9]), 'the outsider never got in')
  })
})
