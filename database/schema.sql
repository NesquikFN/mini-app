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
  ('00000000-0000-0000-0000-000000000100', 'Без гуртожитку', 'Без гуртожитку'),
  ('00000000-0000-0000-0000-000000000101', 'Гуртожиток №1', '№1'),
  ('00000000-0000-0000-0000-000000000102', 'Гуртожиток №2', '№2'),
  ('00000000-0000-0000-0000-000000000103', 'Гуртожиток №3', '№3'),
  ('00000000-0000-0000-0000-000000000104', 'Гуртожиток №4', '№4'),
  ('00000000-0000-0000-0000-000000000105', 'Гуртожиток №5', '№5'),
  ('00000000-0000-0000-0000-000000000106', 'Гуртожиток №6', '№6')
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
  nickname varchar(40),
  instagram varchar(30),
  bio varchar(500),
  age smallint check (age between 13 and 120),
  faculty varchar(100),
  -- Ручна модерація реєстрації — новий користувач не бачить основний
  -- застосунок, поки адмін не схвалить заявку (RegistrationGate на
  -- frontend). Fresh install стартує прямо з 'not_submitted' за
  -- замовчуванням; на живій production-базі цей default виставляється
  -- лише ПІСЛЯ бекфілу існуючих рядків у 'approved' — див.
  -- migrations/0019_registration_moderation.sql.
  registration_status varchar(20) not null default 'not_submitted'
    check (registration_status in ('not_submitted', 'pending', 'approved', 'rejected')),
  registration_submitted_at timestamptz,
  registration_reviewed_at timestamptz,
  registration_reviewed_by uuid references users (id) on delete set null,
  registration_rejection_reason varchar(500),
  banned_until timestamptz,
  banned_permanently boolean not null default false,
  -- Гуртожиток користувача. Nullable: новий користувач обирає його при
  -- онбордингу (frontend), обов'язковість не форсується на рівні БД. FK
  -- без ON DELETE CASCADE/SET NULL навмисно — видалення гуртожитка, до
  -- якого досі належать users, має бути заблоковане (RESTRICT), а не
  -- тихо лишати людей без гуртожитку.
  dormitory_id uuid references dormitories (id),
  created_at timestamptz not null default now(),
  -- Особиста підписка на DM-сповіщення про нові події від бота, окремо
  -- від групового чату (app_settings.notification_chat_id).
  notify_new_events boolean not null default false,
  constraint users_telegram_id_key unique (telegram_id)
);

create index if not exists idx_users_telegram_id on users (telegram_id);
create index if not exists idx_users_dormitory_id on users (dormitory_id);
create index if not exists idx_users_active_ban on users (banned_permanently, banned_until);
create index if not exists idx_users_registration_status_submitted_at
  on users (registration_status, registration_submitted_at);

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
  is_vip_only boolean not null default false,
  -- Роль «ГПУ» — незалежна від VIP (migrations/0026_gpu_role_and_events.sql):
  -- жодна подія не може бути одночасно VIP-only й ГПУ-only, див.
  -- constraint events_not_vip_and_gpu_only нижче.
  is_gpu_only boolean not null default false,
  date date not null,
  time time not null,
  location text not null,
  max_participants integer not null,
  -- Дедуплікація нагадувань "за 30 хвилин" (event-reminders.service.ts).
  reminder_sent_at timestamptz,
  -- Гуртожиток, до якого належить подія — завжди береться з creator's
  -- users.dormitory_id на backend, ніколи з клієнтського запиту (див.
  -- events.service.createEvent). NOT NULL: кожна подія завжди належить
  -- конкретному гуртожитку. Той самий RESTRICT-за-замовчуванням FK, що
  -- й для users.
  dormitory_id uuid references dormitories (id),
  created_at timestamptz not null default now(),
  constraint events_max_participants_positive check (max_participants > 0),
  constraint events_not_vip_and_gpu_only check (not (is_vip_only and is_gpu_only))
);

create index if not exists idx_events_creator_id on events (creator_id);
create index if not exists idx_events_date on events (date);
create index if not exists idx_events_dormitory_id on events (dormitory_id);
create index if not exists idx_events_vip_only_date on events (date) where is_vip_only = true;
create index if not exists idx_events_gpu_only_date on events (date) where is_gpu_only = true;
create index if not exists idx_events_reminder_pending
  on events (date, time)
  where reminder_sent_at is null;

-- =========================================================
-- Регулярні шаблони ігор для адмін-панелі
-- =========================================================
create table if not exists event_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text not null,
  is_online boolean not null default false,
  max_participants integer not null default 12 check (max_participants > 0),
  group_url text,
  game_url text,
  game_url_required boolean not null default false,
  image_url text,
  dormitory_id uuid references dormitories (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_templates_dormitory_id on event_templates (dormitory_id);

alter table events
  add column if not exists source_template_id uuid references event_templates (id) on delete set null;

alter table events
  add column if not exists game_url text;

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
-- Таблиця hosts (див. migrations/0014_hosts_and_notifications.sql)
-- =========================================================
-- "Хост" — право редагувати/видаляти/створювати шаблони ігор, окремо
-- від admin_users (адміни й так мають повний доступ). Той самий шаблон
-- таблиці, що й admin_users.
create table if not exists hosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint hosts_user_id_key unique (user_id)
);

create table if not exists vip_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint vip_users_user_id_key unique (user_id)
);

create index if not exists idx_vip_users_user_id on vip_users (user_id);

-- «ГПУ» — та сама конструкція, що й vip_users, повністю незалежна роль
-- (див. migrations/0026_gpu_role_and_events.sql).
create table if not exists gpu_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint gpu_users_user_id_key unique (user_id)
);

create index if not exists idx_gpu_users_user_id on gpu_users (user_id);

create index if not exists idx_hosts_user_id on hosts (user_id);

-- =========================================================
-- Row Level Security
-- =========================================================
-- Успадковано від часів Supabase (де backend ходив через SERVICE_ROLE_KEY,
-- який ігнорує RLS). Зараз backend підключається напряму через pg під
-- суперюзером `postgres`, який теж завжди ігнорує RLS — тож ці rows
-- залишаються суто задокументованим наміром "ніякого прямого публічного
-- доступу з frontend", а не реальним захистом. Якщо колись з'явиться
-- окремий непривілейований DB-користувач для якогось прямого доступу,
-- під нього тоді й додасться вузько сформульована policy.
alter table users enable row level security;
alter table events enable row level security;
alter table event_participants enable row level security;
alter table admin_users enable row level security;
alter table hosts enable row level security;
alter table vip_users enable row level security;
alter table gpu_users enable row level security;
alter table dormitories enable row level security;

-- Глобальні налаштування застосунку (один singleton-рядок).
create table if not exists app_settings (
  id boolean primary key default true check (id),
  notification_chat_id text,
  notification_chat_title text,
  notification_thread_id text,
  notification_thread_title text,
  -- Посилання на Discord/Telegram-спільноти для іконок на головному екрані.
  discord_url text,
  telegram_url text,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (true) on conflict (id) do nothing;
alter table app_settings enable row level security;

-- Журнал усіх повідомлень, надісланих ботом — для адмін-панелі "Журнал
-- сповіщень" (кому й коли бот щось надіслав).
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  kind text not null,
  event_id uuid references events (id) on delete set null,
  event_title text,
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_log_created_at on notification_log (created_at desc);
create index if not exists idx_notification_log_chat_id on notification_log (chat_id);

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
  v_is_vip_only boolean;
  v_is_gpu_only boolean;
begin
  select max_participants, is_vip_only, is_gpu_only
  into v_max_participants, v_is_vip_only, v_is_gpu_only
  from events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_is_vip_only and not exists (
    select 1 from vip_users where user_id = p_user_id
  ) then
    raise exception 'EVENT_VIP_REQUIRED';
  end if;

  if v_is_gpu_only and not exists (
    select 1 from gpu_users where user_id = p_user_id
  ) then
    raise exception 'EVENT_GPU_REQUIRED';
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

-- =========================================================
-- Постійний реєстр Telegram-чатів/гілок (webhook)
-- =========================================================
-- Заповнюється вебхуком у реальному часі — замінює попередній підхід
-- через getUpdates(), який давав лише обмежене й нестабільне вікно
-- останніх подій (активність в одному чаті витісняла звідти інші).
create table if not exists telegram_chats (
  chat_id text primary key,
  title text not null,
  type text not null check (type in ('group', 'supergroup', 'channel')),
  is_bot_member boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists telegram_topics (
  chat_id text not null references telegram_chats (chat_id) on delete cascade,
  thread_id text not null,
  title text not null,
  updated_at timestamptz not null default now(),
  primary key (chat_id, thread_id)
);
