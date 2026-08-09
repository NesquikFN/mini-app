create table if not exists public.vip_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint vip_users_user_id_key unique (user_id)
);

create index if not exists idx_vip_users_user_id on public.vip_users (user_id);

alter table public.events
  add column if not exists is_vip_only boolean not null default false;

create index if not exists idx_events_vip_only_date
  on public.events (date)
  where is_vip_only = true;

alter table public.vip_users enable row level security;

create or replace function public.join_event(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_is_vip_only boolean;
begin
  select max_participants, is_vip_only
  into v_max_participants, v_is_vip_only
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_is_vip_only and not exists (
    select 1 from public.vip_users where user_id = p_user_id
  ) then
    raise exception 'EVENT_VIP_REQUIRED';
  end if;

  if exists (
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = p_user_id
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  select count(*)
  into v_current_count
  from public.event_participants
  where event_id = p_event_id;

  if v_current_count >= v_max_participants then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, p_user_id);
end;
$$;
