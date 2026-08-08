import pg from 'pg'
import { env } from './env'

// The rest of the codebase (types, Zod schemas, JSON responses, and the
// frontend running inside Telegram's WebKit-based iOS WebView) expects
// timestamp columns as proper ISO 8601 strings ("...T...Z") — the exact
// shape Supabase's REST API always returned. node-postgres instead parses
// timestamp(tz) into JS Date objects by default, and its own text format
// for them ("2026-08-07 20:49:04+00") uses a space instead of "T", which
// older WebKit Date.parse() can choke on. OIDs: date=1082 (kept as plain
// "YYYY-MM-DD" — converting through Date would risk a timezone shift),
// timestamp=1114, timestamptz=1184.
pg.types.setTypeParser(1082, (value) => value)
pg.types.setTypeParser(1114, (value) => new Date(`${value}Z`).toISOString())
pg.types.setTypeParser(1184, (value) => new Date(value).toISOString())

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // Railway's internal network doesn't need TLS; the public proxy does.
  // rejectUnauthorized: false keeps this working either way without
  // needing Railway's CA bundle wired in.
  ssl: env.DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false },
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params)
}
