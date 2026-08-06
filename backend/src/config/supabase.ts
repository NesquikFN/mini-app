import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Немає згенерованих типів Database (потребують живого проєкту:
// `supabase gen types typescript`), тому клієнт типізований як `any` за
// замовчуванням SDK. Репозиторії в src/repositories/* самі описують
// форму рядків (interface *Row) і не пропускають `any` далі по коду.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
