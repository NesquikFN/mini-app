-- DormHub — migration 0002: адміністратори.
-- Додає admin_users — таблицю-маркер, яка визначає, хто з users має доступ
-- до адмін-панелі. Окремого поля-прапорця на users не робимо: зв'язана
-- таблиця дозволяє в майбутньому зберігати додаткові адмінські метадані
-- (роль, хто призначив тощо), не чіпаючи основну таблицю users.

-- =========================================================
-- Таблиця admin_users
-- =========================================================
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint admin_users_user_id_key unique (user_id)
);

create index if not exists idx_admin_users_user_id on admin_users (user_id);

-- Той самий підхід, що й для інших таблиць (див. 0001_init_schema.sql):
-- backend ходить через SERVICE_ROLE_KEY і ігнорує RLS, тому жодна policy
-- тут не потрібна — RLS увімкнено лише щоб anon/authenticated ролі не
-- мали жодного прямого доступу.
alter table admin_users enable row level security;

-- Призначити адміністратора (виконати вручну в Supabase SQL Editor,
-- підставивши реальний telegram_id — див. README, розділ "Адмін-панель"):
--
-- insert into admin_users (user_id)
-- select id from users where telegram_id = 123456789
-- on conflict (user_id) do nothing;
