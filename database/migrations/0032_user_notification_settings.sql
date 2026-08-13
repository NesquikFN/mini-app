-- Особисті Telegram-сповіщення: підтвердження участі та сповіщення
-- організатора про нового учасника.
--
-- "Нові події" НЕ дублюється тут: users.notify_new_events уже є робочим
-- джерелом правди для цього перемикача (announceEvent у
-- events.service.ts, аудиторія розсилки опитувань, команда бота
-- /notifications_off, перемикач на сторінці «Ігри») — додавати другу
-- копію того самого прапорця означало б два джерела правди, які можуть
-- розійтися. Ця таблиця містить лише дві СПРАВДІ нові настройки.
--
-- Міграція суто additive: жодна існуюча таблиця чи колонка не
-- змінюється, тож застосування на живій базі безпечне.

create table if not exists public.user_notification_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  -- "Ти успішно приєднався" — підтвердження учаснику одразу після join.
  join_confirmation_enabled boolean not null default true,
  -- "До твоєї події приєднався новий учасник" — сповіщення організатору.
  organizer_join_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_notification_settings enable row level security;
