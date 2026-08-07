alter table public.events
  add column if not exists group_url text;
