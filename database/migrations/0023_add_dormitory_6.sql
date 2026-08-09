-- DormHub — migration 0023: шостий гуртожиток.
-- Детермінований id узгоджений з рештою початкового довідника.
insert into public.dormitories (id, name, short_name)
values ('00000000-0000-0000-0000-000000000106', 'Гуртожиток №6', '№6')
on conflict (name) do update
set short_name = excluded.short_name;
