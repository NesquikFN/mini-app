-- DormHub — migration 0003: гуртожиток користувача та події.
-- Додає dormitory до users і events. Обидві колонки nullable — у БД уже є
-- реальні users/events без цього поля, тож NOT NULL зараз поставити не
-- можна (див. інструкцію проєкту: спочатку nullable, безпечне заповнення,
-- лише потім за потреби NOT NULL). Обов'язковість для нового користувача
-- та для створення нової події реалізована на рівні застосунку (frontend
-- onboarding-гейт + backend перевірка в events.service.createEvent), а не
-- через constraint на колонці.
--
-- Проста структура на MVP: smallint 1..6, а не окрема таблиця
-- dormitories. Якщо згодом знадобиться більше метаданих про гуртожиток
-- (назва, адреса, комендант тощо), ця колонка легко замінюється на
-- dormitory_id uuid references dormitories(id) — назва поля не зміниться,
-- зміниться лише тип і додасться FK.

alter table users add column if not exists dormitory smallint;
alter table users add constraint users_dormitory_range check (dormitory is null or dormitory between 1 and 6);

alter table events add column if not exists dormitory smallint;
alter table events add constraint events_dormitory_range check (dormitory is null or dormitory between 1 and 6);

create index if not exists idx_events_dormitory on events (dormitory);
