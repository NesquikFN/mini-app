-- Журнал усіх повідомлень, надісланих ботом (анонси в чат, особисті
-- сповіщення про нові події, нагадування за 30 хв, /start-привітання,
-- підтвердження /notifications_off) — для адмін-панелі "Журнал
-- сповіщень", де видно кому й коли бот щось надіслав.
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  -- Telegram chat_id одержувача — текст, бо це може бути як user_id
  -- (приватний DM), так і від'ємний id групового чату.
  chat_id text not null,
  kind text not null,
  event_id uuid references events (id) on delete set null,
  -- Знімок назви події на момент відправки — подію могли згодом
  -- видалити, а історія все одно має лишатись читабельною.
  event_title text,
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_log_created_at on notification_log (created_at desc);
create index if not exists idx_notification_log_chat_id on notification_log (chat_id);
