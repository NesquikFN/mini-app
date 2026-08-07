alter table public.users
  add column if not exists banned_until timestamptz,
  add column if not exists banned_permanently boolean not null default false;

create index if not exists idx_users_active_ban
  on public.users (banned_permanently, banned_until);
