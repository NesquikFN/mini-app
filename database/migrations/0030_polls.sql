-- Опитування «Що організувати наступним?» — користувачі голосують за
-- майбутні активності, адмін створює/публікує/завершує опитування й може
-- разово розіслати його підписникам у особисті повідомлення через бота.
--
-- Міграція суто additive: нові таблиці плюс дві нові nullable-колонки в
-- notification_log (poll_id, poll_question) — жодна існуюча таблиця,
-- функція чи індекс не змінюється й не видаляється, тож застосування на
-- живій базі безпечне.

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question varchar(240) not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'finished')),
  ends_at timestamptz,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  finished_at timestamptz,
  constraint polls_question_not_blank check (char_length(btrim(question)) > 0)
);

-- Одночасно опубліковане (активне) може бути лише одне опитування.
-- Частковий unique-індекс по константному виразу: серед рядків, що
-- пройшли фільтр status = 'active', значення status однакове для всіх
-- ('active'), тож unique дозволяє щонайбільше один такий рядок.
create unique index if not exists idx_polls_single_active
  on public.polls ((status))
  where status = 'active';

create index if not exists idx_polls_status on public.polls (status);
create index if not exists idx_polls_created_by on public.polls (created_by);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  text varchar(120) not null,
  position integer not null check (position >= 0),
  constraint poll_options_text_not_blank check (char_length(btrim(text)) > 0),
  constraint poll_options_unique_position unique (poll_id, position)
);

create index if not exists idx_poll_options_poll_id on public.poll_options (poll_id);

-- Один голос на користувача в опитуванні (unique (poll_id, user_id)),
-- зміна відповіді — upsert через on conflict у репозиторії. Індекс
-- (poll_id, option_id) обслуговує підрахунок результатів по варіантах.
create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint poll_votes_unique unique (poll_id, user_id)
);

create index if not exists idx_poll_votes_poll_id on public.poll_votes (poll_id);
create index if not exists idx_poll_votes_option_id on public.poll_votes (option_id);
create index if not exists idx_poll_votes_poll_option on public.poll_votes (poll_id, option_id);

-- Історія розсилок опитування в особисті повідомлення — окремо від
-- notification_log (де лежить один рядок на одержувача): тут один рядок
-- на весь запуск розсилки, з підсумками targeted/sent/failed/skipped і
-- датою для повторного підтвердження ("надіслати ще раз?").
create table if not exists public.poll_broadcasts (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  audience text not null check (audience in ('all', 'subscribers')),
  targeted integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  started_by uuid not null references public.users (id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_poll_broadcasts_poll_id on public.poll_broadcasts (poll_id);
create index if not exists idx_poll_broadcasts_poll_audience
  on public.poll_broadcasts (poll_id, audience, completed_at desc);

-- Поле kind у notification_log лишається вільним text (як і для решти
-- NotificationKind), тож нове значення 'poll_broadcast' не потребує
-- зміни схеми саме для kind. poll_id/poll_question — додаткові nullable
-- колонки, щоб адмін бачив у журналі, якого саме опитування стосувалось
-- повідомлення, без окремого JOIN у polls (опитування можна видалити).
alter table public.notification_log
  add column if not exists poll_id uuid references public.polls (id) on delete set null;
alter table public.notification_log
  add column if not exists poll_question text;

create index if not exists idx_notification_log_poll_id on public.notification_log (poll_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_broadcasts enable row level security;
