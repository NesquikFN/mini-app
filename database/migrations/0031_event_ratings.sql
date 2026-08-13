-- Репутація організаторів і коротка оцінка завершених подій.
--
-- Оцінити подію може лише реальний учасник, не сам організатор, лише
-- ПІСЛЯ завершення події (протягом 7 днів), і лише один раз на подію
-- (зміна голосу дозволена перші 24 години — enforced атомарним upsert
-- у event-ratings.repository.ts, той самий підхід, що й poll_votes у
-- migrations/0030_polls.sql). Середня оцінка й бейдж «Надійний
-- організатор» ніде не зберігаються — рахуються на льоту з валідних
-- (немодерованих) рядків цієї таблиці.
--
-- Міграція суто additive: нові таблиці плюс одна нова nullable-колонка
-- на events (rating_reminder_sent_at) — жодна існуюча таблиця, функція
-- чи індекс не змінюється й не видаляється, тож застосування на живій
-- базі безпечне.

create table if not exists public.event_ratings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Хто залишив оцінку. Видалення користувача прибирає і його оцінки —
  -- вони й так не повинні входити в чужу репутацію після видалення автора.
  user_id uuid not null references public.users (id) on delete cascade,
  -- Дублює events.creator_id на момент оцінки — дозволяє рахувати
  -- репутацію організатора одним запитом по organizer_id, без JOIN на
  -- events для кожної вибірки. Подія завжди належить одному й тому
  -- самому автору протягом усього життя (передачі організатора немає),
  -- тож розбіжність неможлива.
  organizer_id uuid not null references public.users (id) on delete cascade,
  rating smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Не null означає "виключено адміністратором як підозріле" — рядок
  -- лишається (видно в адмінці, хто й що оцінив), просто не враховується
  -- в жодній агрегації репутації.
  moderated_at timestamptz,
  removed_by uuid references public.users (id) on delete set null,
  constraint event_ratings_unique unique (event_id, user_id),
  constraint event_ratings_rating_range check (rating between 1 and 5)
);

create index if not exists idx_event_ratings_event_id on public.event_ratings (event_id);
create index if not exists idx_event_ratings_organizer_id on public.event_ratings (organizer_id);
-- Частковий індекс саме під запити репутації (moderated_at is null) —
-- вони виконуються на кожен перегляд профілю організатора чи картки події.
create index if not exists idx_event_ratings_organizer_valid
  on public.event_ratings (organizer_id)
  where moderated_at is null;

create table if not exists public.event_rating_tags (
  rating_id uuid not null references public.event_ratings (id) on delete cascade,
  tag text not null,
  constraint event_rating_tags_pkey primary key (rating_id, tag),
  constraint event_rating_tags_valid check (
    tag in ('well_organized', 'good_atmosphere', 'started_on_time', 'friendly_participants', 'want_more')
  )
);

create index if not exists idx_event_rating_tags_rating_id on public.event_rating_tags (rating_id);

-- Дедуплікація нагадування «Як пройшла подія?» — той самий шаблон, що й
-- events.reminder_sent_at (0001/nагадування за 30 хв до старту): один
-- прапорець на подію, виставляється після першої спроби розсилки.
alter table public.events
  add column if not exists rating_reminder_sent_at timestamptz;

create index if not exists idx_events_rating_reminder_pending
  on public.events (date, time)
  where rating_reminder_sent_at is null;

alter table public.event_ratings enable row level security;
alter table public.event_rating_tags enable row level security;
