alter table users
  add column if not exists nickname varchar(40),
  add column if not exists instagram varchar(30),
  add column if not exists bio varchar(500),
  add column if not exists age smallint;

alter table users
  drop constraint if exists users_age_check;

alter table users
  add constraint users_age_check check (age between 13 and 120);
