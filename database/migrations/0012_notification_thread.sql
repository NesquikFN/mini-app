alter table app_settings
  add column if not exists notification_thread_id text,
  add column if not exists notification_thread_title text;
