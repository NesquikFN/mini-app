-- Дедуплікація нагадувань "подія за 30 хвилин" — окремий планувальник
-- (event-reminders.service.ts) періодично перевіряє events, де це поле
-- ще null, і виставляє його одразу після розсилки, щоб той самий запуск
-- не надіслав нагадування двічі.
alter table events
  add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_events_reminder_pending
  on events (date, time)
  where reminder_sent_at is null;
