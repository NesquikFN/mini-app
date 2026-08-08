create table if not exists app_settings (
  id boolean primary key default true check (id),
  notification_chat_id text,
  notification_chat_title text,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (true) on conflict (id) do nothing;
alter table app_settings enable row level security;
