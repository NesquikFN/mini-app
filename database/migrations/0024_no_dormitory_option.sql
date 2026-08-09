-- DormHub — migration 0024: явний вибір для користувачів, які не живуть
-- у гуртожитку. Окремий запис відрізняє свідомий вибір від NULL, який
-- означає, що онбординг ще не завершено.
insert into public.dormitories (id, name, short_name)
values (
  '00000000-0000-0000-0000-000000000100',
  'Без гуртожитку',
  'Без гуртожитку'
)
on conflict (name) do update
set short_name = excluded.short_name;
