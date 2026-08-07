-- DormHub — повна PostgreSQL-схема для Supabase.
-- Виконати повністю один раз у Supabase SQL Editor (Project → SQL Editor → New query).
-- Та сама схема продубльована у database/migrations/0001_init_schema.sql,
-- database/migrations/0002_admin_users.sql та
-- database/migrations/0004_dormitories.sql для майбутнього версіонування
-- через Supabase CLI migrations. migrations/0003_dormitory.sql — проміжний
-- крок (smallint-поле dormitory), повністю замінений 0004 на нормальну
-- таблицю dormitories з FK; цей файл одразу відображає фінальний стан.

-- Потрібно для gen_random_uuid().
create extension if not exists pgcrypto;

-- =========================================================
-- Таблиця dormitories
-- =========================================================
create table if not exists dormitories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  created_at timestamptz not null default now(),
  constraint dormitories_name_key unique (name)
);

-- Детерміновані id — узгоджені з migrations/0004_dormitories.sql, щоб
-- обидва шляхи встановлення (цей файл або послідовні migrations) давали
-- однаковий результат.
insert into dormitories (id, name, short_name) values
  ('00000000-0000-0000-0000-000000000101', 'Гуртожиток №1', '№1'),
  ('00000000-0000-0000-0000-000000000102', 'Гуртожиток №2', '№2'),
  ('00000000-0000-0000-0000-000000000103', 'Гуртожиток №3', '№3'),
  ('00000000-0000-0000-0000-000000000104', 'Гуртожиток №4', '№4'),
  ('00000000-0000-0000-0000-000000000105', 'Гуртожиток №5', '№5')
on conflict (name) do nothing;

-- =========================================================
-- Таблиця users
-- =========================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  username text,
  first_name text not null,
  last_name text,
  photo_url text,
  banned_until timestamptz,
  banned_permanently boolean not null default false,
  -- Гуртожиток користувача. Nullable: новий користувач обирає його при
  -- онбордингу (frontend), обов'язковість не форсується на рівні БД. FK
  -- без ON DELETE CASCADE/SET NULL навмисно — видалення гуртожитка, до
  -- якого досі належать users, має бути заблоковане (RESTRICT), а не
  -- тихо лишати людей без гуртожитку.
  dormitory_id uuid references dormitories (id),
  created_at timestamptz not null default now(),
  constraint users_telegram_id_key unique (telegram_id)
);

create index if not exists idx_users_telegram_id on users (telegram_id);
create index if not exists idx_users_dormitory_id on users (dormitory_id);
create index if not exists idx_users_active_ban on users (banned_permanently, banned_until);

-- =========================================================
-- Таблиця events
-- =========================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users (id),
  title text not null,
  description text,
  image_url text,
  group_url text,
  is_online boolean not null default false,
  date date not null,
  time time not null,
  location text not null,
  max_participants integer not null,
  -- Гуртожиток, до якого належить подія — завжди береться з creator's
  -- users.dormitory_id на backend, ніколи з клієнтського запиту (див.
  -- events.service.createEvent). NOT NULL: кожна подія завжди належить
  -- конкретному гуртожитку. Той самий RESTRICT-за-замовчуванням FK, що
  -- й для users.
  dormitory_id uuid references dormitories (id),
  created_at timestamptz not null default now(),
  constraint events_max_participants_positive check (max_participants > 0)
);

create index if not exists idx_events_creator_id on events (creator_id);
create index if not exists idx_events_date on events (date);
create index if not exists idx_events_dormitory_id on events (dormitory_id);

-- =========================================================
-- Регулярні шаблони ігор для адмін-панелі
-- =========================================================
create table if not exists event_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  weekday smallint not null check (weekday between 0 and 6),
  time time not null,
  location text not null,
  is_online boolean not null default false,
  max_participants integer not null check (max_participants > 0),
  group_url text,
  image_url text,
  dormitory_id uuid references dormitories (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_templates_weekday on event_templates (weekday);
create index if not exists idx_event_templates_dormitory_id on event_templates (dormitory_id);

alter table events
  add column if not exists source_template_id uuid references event_templates (id) on delete set null;

create unique index if not exists idx_events_template_date_unique
  on events (source_template_id, date)
  where source_template_id is not null;

-- =========================================================
-- Таблиця event_participants
-- =========================================================
create table if not exists event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_participants_unique unique (event_id, user_id)
);

create index if not exists idx_event_participants_event_id on event_participants (event_id);
create index if not exists idx_event_participants_user_id on event_participants (user_id);

-- =========================================================
-- Таблиця admin_users (див. migrations/0002_admin_users.sql)
-- =========================================================
-- Маркер "цей users.id — адміністратор". Окремого поля-прапорця на users
-- не робимо: зв'язана таблиця дозволяє в майбутньому зберігати додаткові
-- адмінські метадані, не чіпаючи основну таблицю users.
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint admin_users_user_id_key unique (user_id)
);

create index if not exists idx_admin_users_user_id on admin_users (user_id);

-- =========================================================
-- Row Level Security
-- =========================================================
-- Backend звертається до Supabase через SERVICE_ROLE_KEY, який ігнорує RLS
-- повністю, тому додаткові policy для сервісного доступу не потрібні.
-- RLS вмикаємо на всіх таблицях і НЕ додаємо жодної policy — це означає
-- "заборонено все" для anon/authenticated ролей (тобто прямого доступу
-- з frontend, коли б він не з'явився). Якщо в майбутньому frontend матиме
-- пряме публічне читання через anon key, під це буде додано окрему,
-- вузько сформульовану policy — не раніше, ніж це стане реально потрібно.
alter table users enable row level security;
alter table events enable row level security;
alter table event_participants enable row level security;
alter table admin_users enable row level security;
alter table dormitories enable row level security;

-- =========================================================
-- Атомарна функція приєднання до події (захист від race condition)
-- =========================================================
-- Проблема: без цієї функції backend мусив би виконати
-- SELECT (порахувати учасників) → перевірити ліміт → INSERT окремими
-- запитами. Між SELECT і INSERT два одночасні запити можуть обидва
-- побачити "є 1 вільне місце" і обидва вставити рядок, перевищивши
-- max_participants. `select ... for update` блокує рядок events на час
-- транзакції, тож другий одночасний виклик join_event для тієї самої
-- події чекає, поки перший завершиться (COMMIT/ROLLBACK), і вже бачить
-- оновлену кількість учасників.
create or replace function join_event(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
begin
  select max_participants
  into v_max_participants
  from events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if exists (
    select 1 from event_participants
    where event_id = p_event_id and user_id = p_user_id
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  select count(*)
  into v_current_count
  from event_participants
  where event_id = p_event_id;

  if v_current_count >= v_max_participants then
    raise exception 'EVENT_FULL';
  end if;

  insert into event_participants (event_id, user_id) values (p_event_id, p_user_id);
end;
$$;
