-- Ручна модерація реєстрації: нові користувачі не бачать основний
-- застосунок, поки адмін не схвалить їхню заявку (вік/факультет/
-- Instagram/про себе — ті самі профільні поля, що й у 0018, тому
-- окремої таблиці заявок нема, усе живе прямо в users).
alter table users
  add column if not exists faculty varchar(100),
  add column if not exists registration_status varchar(20),
  add column if not exists registration_submitted_at timestamptz,
  add column if not exists registration_reviewed_at timestamptz,
  add column if not exists registration_reviewed_by uuid references users (id) on delete set null,
  add column if not exists registration_rejection_reason varchar(500);

-- Усі, хто вже користувався застосунком до цієї міграції, не повинні
-- раптом опинитись заблокованими новим гейтом — лише рядки, ще не
-- зачеплені цим кроком (null), тож повторний запуск міграції безпечний
-- і не чіпає рішення, які вже колись тут проставили.
update users
  set registration_status = 'approved'
  where registration_status is null;

-- Лише ПІСЛЯ бекфілу існуючих рядків: нові користувачі, яких ще не
-- торкнувся жоден insert, повинні стартувати з not_submitted.
alter table users
  alter column registration_status set default 'not_submitted';

alter table users
  alter column registration_status set not null;

alter table users
  drop constraint if exists users_registration_status_check;

alter table users
  add constraint users_registration_status_check
  check (registration_status in ('not_submitted', 'pending', 'approved', 'rejected'));

-- Адмінський список заявок фільтрує за статусом і сортує pending за
-- датою подачі — складений індекс покриває обидва відразу.
create index if not exists idx_users_registration_status_submitted_at
  on users (registration_status, registration_submitted_at);
