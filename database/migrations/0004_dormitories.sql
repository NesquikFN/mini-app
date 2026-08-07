-- DormHub — migration 0004: повноцінна таблиця гуртожитків.
-- Замінює тимчасове поле users.dormitory / events.dormitory (smallint
-- 1..6, migrations/0003_dormitory.sql) на нормальну сутність dormitories
-- з FK — так, щоб пізніше можна було редагувати/додавати гуртожитки через
-- адмінку, не чіпаючи users/events.
--
-- Детерміновані id для seed-рядків — дозволяє безпечно прогнати цей
-- файл повторно (ON CONFLICT DO NOTHING) і дає точковий backfill старого
-- smallint-значення 1..5 в конкретний рядок dormitories нижче, без
-- залежності від порядку вставки чи CTE.
create table if not exists dormitories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  created_at timestamptz not null default now(),
  constraint dormitories_name_key unique (name)
);

alter table dormitories enable row level security;

insert into dormitories (id, name, short_name) values
  ('00000000-0000-0000-0000-000000000101', 'Гуртожиток №1', '№1'),
  ('00000000-0000-0000-0000-000000000102', 'Гуртожиток №2', '№2'),
  ('00000000-0000-0000-0000-000000000103', 'Гуртожиток №3', '№3'),
  ('00000000-0000-0000-0000-000000000104', 'Гуртожиток №4', '№4'),
  ('00000000-0000-0000-0000-000000000105', 'Гуртожиток №5', '№5')
on conflict (name) do nothing;

-- =========================================================
-- users.dormitory_id
-- =========================================================
-- Nullable: нового користувача просимо обрати гуртожиток при онбордингу
-- (frontend), але на рівні БД це не примусово — так само, як і в
-- 0003_dormitory.sql. FK без ON DELETE CASCADE/SET NULL навмисно: видалення
-- гуртожитка, до якого досі належать users, має бути заблоковане
-- (стандартна поведінка NO ACTION/RESTRICT), а не тихо лишати їх без
-- гуртожитку чи каскадно видаляти людей.
alter table users add column if not exists dormitory_id uuid references dormitories (id);
create index if not exists idx_users_dormitory_id on users (dormitory_id);

update users
set dormitory_id = (case dormitory
  when 1 then '00000000-0000-0000-0000-000000000101'
  when 2 then '00000000-0000-0000-0000-000000000102'
  when 3 then '00000000-0000-0000-0000-000000000103'
  when 4 then '00000000-0000-0000-0000-000000000104'
  when 5 then '00000000-0000-0000-0000-000000000105'
  else null
end)::uuid
where dormitory is not null and dormitory_id is null;

alter table users drop column if exists dormitory;

-- =========================================================
-- events.dormitory_id
-- =========================================================
-- NOT NULL за вимогою задачі — кожна подія завжди належить конкретному
-- гуртожитку. Спочатку додаємо nullable, бекфілимо (існуючі події без
-- старого smallint-значення отримують дефолтний Гуртожиток №1, щоб не
-- втратити жоден запис), і лише потім вмикаємо NOT NULL. Той самий
-- RESTRICT-за-замовчуванням FK, що й для users.
alter table events add column if not exists dormitory_id uuid references dormitories (id);

update events
set dormitory_id = (case dormitory
  when 1 then '00000000-0000-0000-0000-000000000101'
  when 2 then '00000000-0000-0000-0000-000000000102'
  when 3 then '00000000-0000-0000-0000-000000000103'
  when 4 then '00000000-0000-0000-0000-000000000104'
  when 5 then '00000000-0000-0000-0000-000000000105'
  else '00000000-0000-0000-0000-000000000101'
end)::uuid
where dormitory_id is null;

alter table events drop column if exists dormitory;
alter table events alter column dormitory_id set not null;

create index if not exists idx_events_dormitory_id on events (dormitory_id);
