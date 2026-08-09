alter table public.event_templates
  add column if not exists game_url text,
  add column if not exists game_url_required boolean not null default false;

alter table public.event_templates
  alter column time set default '00:00';

comment on column public.event_templates.time is
  'Legacy compatibility only; template launch time is always supplied by the user.';

alter table public.events
  add column if not exists game_url text;
