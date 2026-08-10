-- DormHub — migration 0025: кількість учасників задається під час запуску
-- шаблону. Колонка лишається для сумісності зі старими записами, але новий
-- код її не читає; default дозволяє створювати шаблони без цього поля.
alter table public.event_templates
  alter column max_participants set default 12;

comment on column public.event_templates.max_participants is
  'Legacy compatibility only; participant limit is always supplied when the template is launched.';
