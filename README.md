# DormHub

Telegram Mini App для мешканців гуртожитку. Дозволяє переглядати події, створювати власні, приєднуватися до них та переглядати профіль.

> Проект перебуває на етапі розробки (Етап 5: підключення PostgreSQL через Supabase). Frontend поки що працює на mock-даних і ще не підключений до backend.

## Технології

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Telegram Mini Apps API
- **Backend:** Node.js, Express, TypeScript, Zod, Supabase JS client
- **База даних:** Supabase (PostgreSQL)
- **Інше:** ESLint, Prettier, Git, dotenv

## Структура проекту

```text
dormhub/
├── frontend/               # React-застосунок (Telegram Mini App), поки на mock-даних
├── backend/                # Express API
├── database/
│   ├── schema.sql          # повна SQL-схема — запустити один раз у Supabase SQL Editor
│   ├── seed.sql            # тестові дані — запустити після schema.sql
│   └── migrations/
│       └── 0001_init_schema.sql   # та сама схема, версійована для supabase CLI
├── .gitignore
├── README.md
└── package.json            # npm workspaces (frontend + backend)
```

## Встановлення

```bash
npm install
```

(запускається з кореня — встановить залежності для `frontend` і `backend` через npm workspaces)

## Frontend

```bash
npm run dev --workspace=frontend
```

Відкриється на `http://localhost:5173`. Працює повністю на mock-даних, backend поки не підключений.

## Backend

### 1. Налаштування Supabase (потрібно зробити один раз)

1. Створіть акаунт і новий проєкт на [supabase.com](https://supabase.com) (безкоштовного плану достатньо).
2. Дочекайтесь, поки Supabase підготує проєкт (це займає 1-2 хвилини).
3. Відкрийте **SQL Editor** (іконка в лівому меню) → **New query**.
4. Скопіюйте весь вміст файлу [`database/schema.sql`](database/schema.sql), вставте в редактор і натисніть **Run**.
   Це створить таблиці `users`, `events`, `event_participants`, індекси, увімкне Row Level Security та створить функцію `join_event` (атомарне приєднання до події).
5. Новим запитом (**New query**) скопіюйте вміст [`database/seed.sql`](database/seed.sql) і теж виконайте.
   Це додасть тестового користувача та кілька подій українською для перевірки API.
6. Відкрийте **Project Settings → API**. Звідти знадобляться два значення:
   - **Project URL** → це `SUPABASE_URL`;
   - **service_role** ключ (у розділі "Project API keys", **не** `anon public`) → це `SUPABASE_SERVICE_ROLE_KEY`.

   ⚠️ **`service_role` ключ — серверний секрет.** Він дає повний доступ до бази в обхід Row Level Security. Ніколи не вставляйте його у frontend-код, не публікуйте, не комітьте в Git.

### 2. Налаштування backend

```bash
cd backend
cp .env.example .env
```

Відкрийте `backend/.env` і вставте значення з кроку 1:

```text
SUPABASE_URL=https://<ваш-проєкт>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role ключ>
```

### 3. Запуск

```bash
npm run dev --workspace=backend
```

Якщо `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` не задані або некоректні — backend одразу завершиться з зрозумілим повідомленням про помилку (це навмисно: без бази даних API працювати не може).

### 4. Перевірка API

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/events
```

Повний список ендпоінтів — `GET/POST /api/events`, `GET /api/events/:id`, `POST /api/events/:id/join`, `DELETE /api/events/:id/leave`, `GET /api/me`, `GET /api/me/events`.

## Безпека Supabase

- Row Level Security увімкнено на всіх трьох таблицях, публічних policy немає — anon/authenticated ролі (тобто прямі запити з браузера) не бачать нічого.
- Backend звертається до Supabase через `service_role` ключ, який ігнорує RLS повністю — тому у нього є доступ, попри відсутність policy.
- Frontend наразі **не** звертається до Supabase напряму і не матиме до нього прямого доступу — весь трафік іде через backend API.

## Статус розробки

- [x] Етап 1 — базова структура монорепозиторію
- [x] Етап 2 — налаштування frontend
- [x] Етап 3 — UI на mock-даних
- [x] Етап 4 — backend (in-memory)
- [x] Етап 5 — PostgreSQL-схема та підключення Supabase
- [ ] Етап 6 — підключення frontend до backend
- [ ] Етап 7 — Telegram авторизація
- [ ] Етап 8 — перевірка створення подій та участі
- [ ] Етап 9 — підготовка до деплою
