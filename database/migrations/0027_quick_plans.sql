-- Швидкі плани «Хто зі мною?» — короткоживучі спонтанні активності на
-- сьогодні, окремі від повноцінних events (немає ні обкладинки, ні
-- ліміту учасників, ні дати — лише текст і термін життя). Навмисно
-- окремі таблиці, а не прапорець на events: у плану інша модель доступу
-- (VIP/ГПУ на нього не впливають) і власний life cycle через expires_at.
--
-- Міграція суто additive: жодна існуюча таблиця, функція чи індекс не
-- змінюються, тож застосування на живій базі безпечне.

create table if not exists public.quick_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users (id) on delete cascade,
  text varchar(180) not null,
  category text not null,
  is_online boolean not null default false,
  -- Гуртожиток плану — завжди з users.dormitory_id автора на боці
  -- backend, ніколи з тіла запиту. Для онлайн-плану лишається null:
  -- такий план глобальний і видимий усім схваленим користувачам.
  dormitory_id uuid references public.dormitories (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Ті самі межі, що й у Zod-схемі на backend (10–180 символів) —
  -- продубльовані в БД, щоб їх не можна було обійти повз валідацію.
  constraint quick_plans_text_length check (char_length(btrim(text)) between 10 and 180),
  constraint quick_plans_category_valid
    check (category in ('sport', 'study', 'food', 'walk', 'games', 'other')),
  -- Офлайн-план завжди належить конкретному гуртожитку, інакше його
  -- нікому не було б видно; онлайн-план навпаки не має гуртожитку.
  constraint quick_plans_dormitory_matches_format
    check ((is_online and dormitory_id is null) or (not is_online and dormitory_id is not null))
);

-- Головний фільтр списку — «ще не протух»; далі за форматом і
-- гуртожитком. Частковий індекс тут не годиться (предикат залежав би
-- від now(), а він не IMMUTABLE), тож звичайні b-tree.
create index if not exists idx_quick_plans_expires_at on public.quick_plans (expires_at);
create index if not exists idx_quick_plans_dormitory_id on public.quick_plans (dormitory_id);
create index if not exists idx_quick_plans_is_online on public.quick_plans (is_online);
create index if not exists idx_quick_plans_creator_id on public.quick_plans (creator_id);

create table if not exists public.quick_plan_participants (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.quick_plans (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Повторний «Я з вами» не створює дубль — саме цей unique робить
  -- join ідемпотентним (on conflict do nothing у репозиторії).
  constraint quick_plan_participants_unique unique (plan_id, user_id)
);

create index if not exists idx_quick_plan_participants_plan_id
  on public.quick_plan_participants (plan_id);
create index if not exists idx_quick_plan_participants_user_id
  on public.quick_plan_participants (user_id);

alter table public.quick_plans enable row level security;
alter table public.quick_plan_participants enable row level security;
