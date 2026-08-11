-- Роль «ГПУ» — незалежна від VIP, той самий шаблон, що й
-- migrations/0022_vip_role_and_events.sql (окрема таблиця-маркер +
-- is_gpu_only на events). VIP і ГПУ навмисно не перетинаються: жодна з
-- цих двох міграцій не чіпає дані іншої ролі.
create table if not exists public.gpu_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint gpu_users_user_id_key unique (user_id)
);

create index if not exists idx_gpu_users_user_id on public.gpu_users (user_id);

alter table public.events
  add column if not exists is_gpu_only boolean not null default false;

create index if not exists idx_events_gpu_only_date
  on public.events (date)
  where is_gpu_only = true;

-- Подія не може бути одночасно VIP-only і ГПУ-only. `add constraint`
-- (на відміну від `add column`) не підтримує `if not exists` у
-- PostgreSQL, тож ідемпотентність міграції — через явну перевірку
-- pg_constraint. Existing rows завжди мають is_gpu_only = false
-- (щойно доданий стовпець із default), тож ця перевірка не може
-- провалитись на вже наявних даних.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_not_vip_and_gpu_only'
  ) then
    alter table public.events
      add constraint events_not_vip_and_gpu_only
      check (not (is_vip_only and is_gpu_only));
  end if;
end
$$;

alter table public.gpu_users enable row level security;

create or replace function public.join_event(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_is_vip_only boolean;
  v_is_gpu_only boolean;
begin
  select max_participants, is_vip_only, is_gpu_only
  into v_max_participants, v_is_vip_only, v_is_gpu_only
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

  if v_is_gpu_only and not exists (
    select 1 from public.gpu_users where user_id = p_user_id
  ) then
    raise exception 'EVENT_GPU_REQUIRED';
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
