-- Лічильники обмеження запитів у БД замість пам'яті процесу.
--
-- express-rate-limit за замовчуванням тримає їх у MemoryStore, тобто
-- вони обнуляються при кожному деплої чи рестарті. Для хвилинного
-- антифлуду це неважливо, а от годинні продуктові ліміти («10 подій на
-- годину», «20 обкладинок на годину») насправді знімалися разом із
-- рестартом — саме вони й переїжджають сюди.
--
-- key — це `<ім'я лімітера>:<user:uuid | ip:адреса>`; префікс потрібен,
-- бо всі лімітери тепер ділять одну таблицю, і без нього виклик
-- createEvent з'їдав би квоту imageUpload того ж користувача.
create table if not exists rate_limit_hits (
  key text primary key,
  hits integer not null,
  -- Кінець поточного вікна. Рядок із expires_at у минулому вважається
  -- порожнім і перевикористовується наступним запитом (див.
  -- backend/src/middleware/rateLimitStore.ts), тож прибирання нижче
  -- потрібне лише щоб таблиця не росла нескінченно.
  expires_at timestamptz not null
);

create index if not exists idx_rate_limit_hits_expires_at on rate_limit_hits (expires_at);

alter table rate_limit_hits enable row level security;
