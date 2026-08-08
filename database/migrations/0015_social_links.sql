-- Посилання на Discord/Telegram-спільноти, які показуються іконками в
-- шапці головного екрана. Редагуються адміном, живуть у тому ж
-- singleton-рядку app_settings, що й налаштування сповіщень.
alter table app_settings
  add column if not exists discord_url text,
  add column if not exists telegram_url text;
