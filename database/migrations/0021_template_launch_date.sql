alter table public.event_templates
  alter column weekday set default 0;

comment on column public.event_templates.weekday is
  'Legacy compatibility only; template launch date is always supplied by the user.';
