alter table public.events
  add column if not exists is_online boolean not null default false;

create index if not exists idx_events_is_online
  on public.events (is_online)
  where is_online = true;
