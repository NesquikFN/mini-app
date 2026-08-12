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
-- Лист очікування (див. migrations/0028_event_waitlist.sql)
-- =========================================================
-- Черга на заповнену подію. Порядок — (created_at, id), де id працює як
-- стабільний tie-breaker. Індекс повторює саме цей порядок.
--
-- created_at за замовчуванням clock_timestamp(), а НЕ now(): now() — це
-- час початку транзакції, однаковий для всіх операцій усередині неї, тож
-- дві транзакції, що стартували одночасно, отримували б однаковий
-- created_at і дублювали позиції в черзі (перевірено конкурентним
-- тестом). clock_timestamp() бере реальний час самої вставки, а оскільки
-- вставки серіалізовані блокуванням рядка події, він гарантовано зростає.
create table if not exists event_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  constraint event_waitlist_unique unique (event_id, user_id)
);

create index if not exists idx_event_waitlist_event_created
  on event_waitlist (event_id, created_at, id);
create index if not exists idx_event_waitlist_user_id on event_waitlist (user_id);

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
alter table event_waitlist enable row level security;
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
-- Швидкі плани «Хто зі мною?» (див. migrations/0027_quick_plans.sql)
-- =========================================================
-- Короткоживучі спонтанні активності на сьогодні — навмисно окремі від
-- events: немає ні обкладинки, ні ліміту учасників, ні дати, а VIP/ГПУ
-- на їх видимість не впливають. Життєвий цикл — через expires_at.
create table if not exists quick_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users (id) on delete cascade,
  text varchar(180) not null,
  category text not null,
  is_online boolean not null default false,
  -- Завжди з users.dormitory_id автора на боці backend, ніколи з тіла
  -- запиту. null для онлайн-плану — такий план глобальний.
  dormitory_id uuid references dormitories (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint quick_plans_text_length check (char_length(btrim(text)) between 10 and 180),
  constraint quick_plans_category_valid
    check (category in ('sport', 'study', 'food', 'walk', 'games', 'other')),
  constraint quick_plans_dormitory_matches_format
    check ((is_online and dormitory_id is null) or (not is_online and dormitory_id is not null))
);

create index if not exists idx_quick_plans_expires_at on quick_plans (expires_at);
create index if not exists idx_quick_plans_dormitory_id on quick_plans (dormitory_id);
create index if not exists idx_quick_plans_is_online on quick_plans (is_online);
create index if not exists idx_quick_plans_creator_id on quick_plans (creator_id);

create table if not exists quick_plan_participants (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references quick_plans (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Робить повторний «Я з вами» ідемпотентним замість дубля.
  constraint quick_plan_participants_unique unique (plan_id, user_id)
);

create index if not exists idx_quick_plan_participants_plan_id on quick_plan_participants (plan_id);
create index if not exists idx_quick_plan_participants_user_id on quick_plan_participants (user_id);

alter table quick_plans enable row level security;
alter table quick_plan_participants enable row level security;

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
  v_next_waiter uuid;
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

  -- Місце, що звільнилось, належить черзі: без цієї перевірки будь-хто,
  -- хто натисне "Я піду" одразу після виходу учасника, обігнав би того,
  -- хто вже чекає. Виняток — сам перший у черзі: для нього прямий join
  -- це не обхід, а використання своєї ж позиції.
  v_next_waiter := next_eligible_waitlist_user(p_event_id);
  if v_next_waiter is not null and v_next_waiter <> p_user_id then
    raise exception 'EVENT_FULL';
  end if;

  insert into event_participants (event_id, user_id) values (p_event_id, p_user_id);

  delete from event_waitlist where event_id = p_event_id and user_id = p_user_id;
end;
$$;

-- =========================================================
-- Лист очікування: допустимість, вступ, вихід, просування
-- =========================================================
-- Ті самі правила доступу, що й для звичайного приєднання
-- (events.service.ts): схвалена реєстрація, відсутність бану, роль для
-- VIP/ГПУ-події та гуртожиток для офлайн-події. Винесено в окрему
-- функцію, щоб join_event і promote_event_waitlist користувались однією
-- копією правил.
--
-- Свідомо НЕ перевіряє, чи подія завершилась: date/time — наївні
-- колонки в київському "стінному" часі, і вся така математика живе в
-- utils/kyivTime.ts. Сервіс не запускає просування для завершеної події.
create or replace function event_waitlist_entry_is_valid(
  p_event_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from events e
    join users u on u.id = p_user_id
    where e.id = p_event_id
      and u.registration_status = 'approved'
      and u.banned_permanently = false
      and (u.banned_until is null or u.banned_until <= now())
      and (
        e.is_online
        or u.dormitory_id is distinct from '00000000-0000-0000-0000-000000000100'::uuid
      )
      and (not e.is_vip_only or exists (select 1 from vip_users v where v.user_id = p_user_id))
      and (not e.is_gpu_only or exists (select 1 from gpu_users g where g.user_id = p_user_id))
      and not exists (
        select 1 from event_participants ep
        where ep.event_id = p_event_id and ep.user_id = p_user_id
      )
  );
$$;

create or replace function next_eligible_waitlist_user(p_event_id uuid)
returns uuid
language sql
stable
as $$
  select w.user_id
  from event_waitlist w
  where w.event_id = p_event_id
    and event_waitlist_entry_is_valid(p_event_id, w.user_id)
  order by w.created_at asc, w.id asc
  limit 1;
$$;

create or replace function join_event_waitlist(p_event_id uuid, p_user_id uuid)
returns integer
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_position integer;
begin
  select max_participants into v_max_participants
  from events where id = p_event_id for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if exists (
    select 1 from event_participants
    where event_id = p_event_id and user_id = p_user_id
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  if not event_waitlist_entry_is_valid(p_event_id, p_user_id) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;

  select count(*) into v_current_count
  from event_participants where event_id = p_event_id;

  -- Місце звільнилось між натисканням і запитом — черга не потрібна,
  -- сервіс замість цього виконає звичайне приєднання.
  if v_current_count < v_max_participants then
    raise exception 'EVENT_NOT_FULL';
  end if;

  insert into event_waitlist (event_id, user_id)
  values (p_event_id, p_user_id)
  on conflict (event_id, user_id) do nothing;

  if not found then
    raise exception 'ALREADY_WAITLISTED';
  end if;

  select count(*) into v_position
  from event_waitlist w
  where w.event_id = p_event_id
    and (w.created_at, w.id) <= (
      select w2.created_at, w2.id from event_waitlist w2
      where w2.event_id = p_event_id and w2.user_id = p_user_id
    );

  return v_position;
end;
$$;

create or replace function leave_event_waitlist(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_removed integer;
begin
  delete from event_waitlist where event_id = p_event_id and user_id = p_user_id;
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

-- Викликається після КОЖНОЇ операції, що звільняє місце: вихід
-- учасника, видалення учасника організатором чи адміном, збільшення
-- max_participants, видалення користувача.
--
-- `for update` на рядку події блокує його на весь час виконання, тож
-- паралельні виклики (два одночасні виходи) або одночасний join_event
-- шикуються в чергу й кожен бачить уже оновлену кількість учасників —
-- завдяки цьому кількість учасників ніколи не перевищує
-- max_participants, а два звільнені місця дають рівно два просування.
--
-- Цикл, а не одне просування: якщо ліміт підняли одразу на кілька
-- місць, переводиться стільки людей, скільки місць з'явилось.
--
-- Недійсні записи (втрачена роль, бан, знята реєстрація, вже учасник)
-- не пропускаються мовчки, а видаляються з черги, щоб не блокувати
-- наступних. Повертає id переведених — сервіс шле їм DM після коміту.
create or replace function promote_event_waitlist(p_event_id uuid)
returns uuid[]
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_entry_id uuid;
  v_user_id uuid;
  v_promoted uuid[] := '{}';
begin
  select max_participants into v_max_participants
  from events where id = p_event_id for update;

  -- Подію могли видалити — просувати нікуди, і це не помилка.
  if not found then
    return v_promoted;
  end if;

  select count(*) into v_current_count
  from event_participants where event_id = p_event_id;

  while v_current_count < v_max_participants loop
    select w.id, w.user_id into v_entry_id, v_user_id
    from event_waitlist w
    where w.event_id = p_event_id
    order by w.created_at asc, w.id asc
    limit 1;

    exit when v_entry_id is null;

    if event_waitlist_entry_is_valid(p_event_id, v_user_id) then
      insert into event_participants (event_id, user_id)
      values (p_event_id, v_user_id)
      on conflict (event_id, user_id) do nothing;

      delete from event_waitlist where id = v_entry_id;

      v_promoted := array_append(v_promoted, v_user_id);
      v_current_count := v_current_count + 1;
    else
      delete from event_waitlist where id = v_entry_id;
    end if;

    v_entry_id := null;
  end loop;

  return v_promoted;
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

-- =========================================================
-- Лічильники обмеження запитів (див. migrations/0029_rate_limit_hits.sql)
-- =========================================================
-- Тільки годинні продуктові ліміти. Хвилинний антифлуд і auth свідомо
-- лишаються в пам'яті процесу — там коротке вікно й зайвий запит до БД
-- на кожен HTTP-запит коштує більше, ніж дає.
create table if not exists rate_limit_hits (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
create index if not exists idx_rate_limit_hits_expires_at on rate_limit_hits (expires_at);
alter table rate_limit_hits enable row level security;
