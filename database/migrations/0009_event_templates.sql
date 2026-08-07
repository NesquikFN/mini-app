create table if not exists public.event_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  weekday smallint not null check (weekday between 0 and 6),
  time time not null,
  location text not null,
  is_online boolean not null default false,
  max_participants integer not null check (max_participants > 0),
  group_url text,
  dormitory_id uuid references public.dormitories (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_templates_weekday
  on public.event_templates (weekday);

create index if not exists idx_event_templates_dormitory_id
  on public.event_templates (dormitory_id);

alter table public.events
  add column if not exists source_template_id uuid
  references public.event_templates (id) on delete set null;

create unique index if not exists idx_events_template_date_unique
  on public.events (source_template_id, date)
  where source_template_id is not null;

alter table public.event_templates
  alter column dormitory_id drop not null;
