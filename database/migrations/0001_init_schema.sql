-- DormHub — migration 0001: початкова схема.
-- Ідентична database/schema.sql (там — для ручного запуску одним файлом
-- у Supabase SQL Editor; тут — для майбутнього supabase CLI / migration
-- history). Зміни схеми додавайте новими файлами 0002_*.sql і т.д.,
-- а не редагуванням цього файлу заднім числом.

-- Потрібно для gen_random_uuid().
create extension if not exists pgcrypto;

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
  created_at timestamptz not null default now(),
  constraint users_telegram_id_key unique (telegram_id)
);

create index if not exists idx_users_telegram_id on users (telegram_id);

-- =========================================================
-- Таблиця events
-- =========================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users (id),
  title text not null,
  description text,
  date date not null,
  time time not null,
  location text not null,
  max_participants integer not null,
  created_at timestamptz not null default now(),
  constraint events_max_participants_positive check (max_participants > 0)
);

create index if not exists idx_events_creator_id on events (creator_id);
create index if not exists idx_events_date on events (date);

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
