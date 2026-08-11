-- Лист очікування для заповнених подій. Міграція additive: жодна
-- існуюча таблиця не змінюється, а join_event лише доповнюється новою
-- перевіркою (її сигнатура й усі наявні коди помилок незмінні).

create table if not exists public.event_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  -- clock_timestamp(), а НЕ now(): now() — це час початку транзакції,
  -- однаковий для всіх операцій усередині неї. Дві транзакції, що
  -- стартували одночасно, отримували б однаковий created_at, і позиції
  -- в черзі дублювались би (перевірено конкурентним тестом:
  -- __tests__/waitlist.integration.test.ts). clock_timestamp() бере
  -- реальний час самої вставки, а оскільки вставки серіалізовані
  -- блокуванням рядка події, він гарантовано зростає.
  created_at timestamptz not null default clock_timestamp(),
  constraint event_waitlist_unique unique (event_id, user_id)
);

-- Порядок черги — (created_at, id): id лишається стабільним
-- tie-breaker'ом на випадок збігу до мікросекунди. Індекс повторює саме
-- цей порядок, щоб «наступний у черзі» читався без сортування.
create index if not exists idx_event_waitlist_event_created
  on public.event_waitlist (event_id, created_at, id);
create index if not exists idx_event_waitlist_user_id
  on public.event_waitlist (user_id);

alter table public.event_waitlist enable row level security;

-- =========================================================
-- Допустимість запису черги
-- =========================================================
-- Ті самі правила, що й для звичайного приєднання (events.service.ts):
-- схвалена реєстрація, відсутність бану, роль для VIP/ГПУ-події та
-- гуртожиток для офлайн-події. Винесено в окрему функцію, щоб
-- promote_event_waitlist і join_event користувались однією копією
-- правил і не могли розійтись.
--
-- Свідомо НЕ перевіряє, чи подія вже завершилась: date/time — наївні
-- колонки в київському «стінному» часі, і вся така математика в проєкті
-- живе в utils/kyivTime.ts. Викликач (сервіс) не запускає просування для
-- завершеної події.
create or replace function public.event_waitlist_entry_is_valid(
  p_event_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.events e
    join public.users u on u.id = p_user_id
    where e.id = p_event_id
      and u.registration_status = 'approved'
      and u.banned_permanently = false
      and (u.banned_until is null or u.banned_until <= now())
      -- Офлайн-подія недоступна тому, хто обрав «Без гуртожитку»
      -- (той самий гейт, що й у joinEvent).
      and (
        e.is_online
        or u.dormitory_id is distinct from '00000000-0000-0000-0000-000000000100'::uuid
      )
      and (
        not e.is_vip_only
        or exists (select 1 from public.vip_users v where v.user_id = p_user_id)
      )
      and (
        not e.is_gpu_only
        or exists (select 1 from public.gpu_users g where g.user_id = p_user_id)
      )
      -- Той, хто вже бере участь, місця з черги не займає.
      and not exists (
        select 1 from public.event_participants ep
        where ep.event_id = p_event_id and ep.user_id = p_user_id
      )
  );
$$;

/** Найстаріший запис черги, який досі має право на місце. */
create or replace function public.next_eligible_waitlist_user(p_event_id uuid)
returns uuid
language sql
stable
as $$
  select w.user_id
  from public.event_waitlist w
  where w.event_id = p_event_id
    and public.event_waitlist_entry_is_valid(p_event_id, w.user_id)
  order by w.created_at asc, w.id asc
  limit 1;
$$;

-- =========================================================
-- Вступ до черги
-- =========================================================
-- `for update` на рядку події серіалізує цю функцію з join_event і
-- promote_event_waitlist: неможливо стати в чергу рівно в той момент,
-- коли інша транзакція вивільняє місце й просуває чергу.
create or replace function public.join_event_waitlist(p_event_id uuid, p_user_id uuid)
returns integer
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_position integer;
begin
  select max_participants
  into v_max_participants
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = p_user_id
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  -- Ролі й доступ перевіряються тими самими правилами, що й при
  -- просуванні — інакше в черзі опинявся б той, кого потім однаково
  -- не можна додати.
  if not public.event_waitlist_entry_is_valid(p_event_id, p_user_id) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;

  select count(*)
  into v_current_count
  from public.event_participants
  where event_id = p_event_id;

  -- Місце звільнилось між натисканням і запитом — черга не потрібна,
  -- сервіс замість цього виконає звичайне приєднання.
  if v_current_count < v_max_participants then
    raise exception 'EVENT_NOT_FULL';
  end if;

  insert into public.event_waitlist (event_id, user_id)
  values (p_event_id, p_user_id)
  on conflict (event_id, user_id) do nothing;

  if not found then
    raise exception 'ALREADY_WAITLISTED';
  end if;

  select count(*)
  into v_position
  from public.event_waitlist w
  where w.event_id = p_event_id
    and (w.created_at, w.id) <= (
      select w2.created_at, w2.id
      from public.event_waitlist w2
      where w2.event_id = p_event_id and w2.user_id = p_user_id
    );

  return v_position;
end;
$$;

create or replace function public.leave_event_waitlist(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_removed integer;
begin
  delete from public.event_waitlist
  where event_id = p_event_id and user_id = p_user_id;

  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

-- =========================================================
-- Просування черги (найкритичніша частина)
-- =========================================================
-- Викликається після КОЖНОЇ операції, що звільняє місце: вихід
-- учасника, видалення учасника організатором чи адміном, збільшення
-- max_participants, видалення користувача.
--
-- `select ... for update` на рядку події блокує його на весь час
-- виконання функції, тож паралельні виклики (два одночасні виходи) або
-- одночасний join_event шикуються в чергу й кожен бачить уже оновлену
-- кількість учасників. Через це кількість учасників ніколи не
-- перевищує max_participants, а два звільнені місця дають рівно два
-- просування.
--
-- Цикл, а не одне просування: якщо ліміт підняли одразу на кілька
-- місць, у той самий момент переводиться стільки людей, скільки місць
-- з'явилось — у порядку (created_at, id).
--
-- Недійсні записи (втрачена роль VIP/ГПУ, бан, знята реєстрація, вже
-- учасник) не пропускаються мовчки, а видаляються з черги — так вони не
-- блокують наступних і не накопичуються назавжди.
--
-- Повертає id переведених користувачів, щоб сервіс надіслав їм DM уже
-- після коміту транзакції.
create or replace function public.promote_event_waitlist(p_event_id uuid)
returns uuid[]
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_entry_id uuid;
  v_user_id uuid;
  v_promoted uuid[] := '{}';
begin
  select max_participants
  into v_max_participants
  from public.events
  where id = p_event_id
  for update;

  -- Подію могли видалити — просувати нікуди, і це не помилка.
  if not found then
    return v_promoted;
  end if;

  select count(*)
  into v_current_count
  from public.event_participants
  where event_id = p_event_id;

  while v_current_count < v_max_participants loop
    select w.id, w.user_id
    into v_entry_id, v_user_id
    from public.event_waitlist w
    where w.event_id = p_event_id
    order by w.created_at asc, w.id asc
    limit 1;

    exit when v_entry_id is null;

    if public.event_waitlist_entry_is_valid(p_event_id, v_user_id) then
      insert into public.event_participants (event_id, user_id)
      values (p_event_id, v_user_id)
      on conflict (event_id, user_id) do nothing;

      delete from public.event_waitlist where id = v_entry_id;

      v_promoted := array_append(v_promoted, v_user_id);
      v_current_count := v_current_count + 1;
    else
      -- Запис більше не дійсний: прибираємо й переходимо до наступного,
      -- не витрачаючи вільне місце.
      delete from public.event_waitlist where id = v_entry_id;
    end if;

    v_entry_id := null;
  end loop;

  return v_promoted;
end;
$$;

-- =========================================================
-- join_event: місце, що звільнилось, належить черзі
-- =========================================================
-- Єдина змістовна зміна щодо 0026 — блок «черга має пріоритет» перед
-- вставкою. Без нього будь-хто, хто натисне «Я піду» одразу після
-- виходу учасника, обігнав би того, хто вже чекає.
--
-- Виняток — сам перший у черзі: якщо він приєднується напряму (напр.
-- застарілий UI показав вільне місце), це не обхід черги, а її
-- використання, тож join дозволено, а його запис у черзі знімається.
create or replace function public.join_event(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_max_participants integer;
  v_current_count integer;
  v_is_vip_only boolean;
  v_is_gpu_only boolean;
  v_next_waiter uuid;
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

  v_next_waiter := public.next_eligible_waitlist_user(p_event_id);
  if v_next_waiter is not null and v_next_waiter <> p_user_id then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, p_user_id);

  -- Приєднався напряму — у черзі більше не потрібен.
  delete from public.event_waitlist
  where event_id = p_event_id and user_id = p_user_id;
end;
$$;
