-- "Хост" — роль з правом редагувати/видаляти/створювати шаблони ігор
-- (окремо від адмінів, які й так мають повний доступ). Дзеркалить
-- admin_users; призначається/знімається через адмін-панель.
create table if not exists hosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint hosts_user_id_key unique (user_id)
);

create index if not exists idx_hosts_user_id on hosts (user_id);

-- Особиста підписка на сповіщення про нові події (DM від бота), окремо
-- від групового чату, який налаштовує адмін у app_settings.
alter table users
  add column if not exists notify_new_events boolean not null default false;
