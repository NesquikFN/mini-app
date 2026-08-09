# DormHub

Telegram Mini App для мешканців гуртожитку. Дозволяє переглядати події, створювати власні, приєднуватися до них та переглядати профіль.

> Frontend і backend підключені, Telegram Mini App автентифікація реалізована (Етап 7), додано окрему адмін-панель.

## Технології

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Telegram Mini Apps API
- **Backend:** Node.js, Express, TypeScript, Zod, pg (node-postgres)
- **База даних:** PostgreSQL (Railway)
- **Інше:** ESLint, Prettier, Git, dotenv

## Структура проекту

```text
dormhub/
├── frontend/               # React-застосунок (Telegram Mini App)
│   └── admin/               # Окрема адмін-панель (React SPA), див. розділ "Адмін-панель"
├── backend/                 # Express API
├── database/
│   ├── schema.sql           # повна SQL-схема — запустити один раз через psql
│   ├── seed.sql              # тестові дані — запустити після schema.sql
│   └── migrations/           # та сама схема версіями, для послідовного застосування
├── .gitignore
├── README.md
└── package.json            # npm workspaces (frontend + frontend/admin + backend)
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

### 1. Налаштування Postgres (потрібно зробити один раз)

1. Створіть Postgres-сервіс (наприклад, на [Railway](https://railway.com) — `New → Database → PostgreSQL`, або будь-який інший хостинг Postgres).
2. Застосуйте схему через `psql`:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
   ```
   Це створить усі таблиці, індекси та функцію `join_event` (атомарне приєднання до події).
3. За бажанням — тестові дані: `psql "$DATABASE_URL" -f database/seed.sql`.
4. Локальна розробка: якщо база захована за приватною мережею (як Railway за замовчуванням), піднімай тунель окремим процесом і тримай його відкритим:
   ```bash
   railway connect Postgres --tunnel-only --port 15432
   ```

### 2. Налаштування backend

```bash
cd backend
cp .env.example .env
```

Відкрийте `backend/.env` і впишіть свій `DATABASE_URL` (при локальній розробці через тунель — `postgresql://postgres:<пароль>@127.0.0.1:15432/railway`).

Для кнопок «Приєднатися» у Telegram також вкажіть `TELEGRAM_APP_SHORT_NAME`.
Його можна знайти в BotFather: `/mybots` → потрібний бот → `Bot Settings` →
`Mini Apps` → ваш застосунок. Це значення з прямого посилання
`t.me/<bot_username>/<short_name>`. Якщо замість окремого застосунку в
BotFather налаштовано `Main Mini App`, змінну можна залишити порожньою.

### 3. Запуск

```bash
npm run dev --workspace=backend
```

Якщо `DATABASE_URL` не заданий або з'єднання не вдається — backend одразу завершиться з зрозумілим повідомленням про помилку (це навмисно: без бази даних API працювати не може).

### 4. Перевірка API

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/events
```

Повний список ендпоінтів — `GET/POST /api/events`, `GET /api/events/:id`, `POST /api/events/:id/join`, `DELETE /api/events/:id/leave`, `GET /api/me`, `GET /api/me/events`.

## Адмін-панель

Окремий React-застосунок у `frontend/admin/` — керування DormHub через
веб-інтерфейс (список користувачів, події: створення/редагування/видалення,
учасники, статистика). Не окрема БД — той самий backend і Supabase.

### Автентифікація адміна

Адмінка — теж Telegram Mini App і використовує **той самий** flow, що й
основний застосунок (`POST /api/auth/telegram`, та сама Telegram-валідація
й сесійний токен — жодної окремої логіки авторизації не заводили). Різниця
лише в тому, що після успішного Telegram-логіну backend додатково перевіряє,
чи є `users.id` цієї людини в таблиці `admin_users` (middleware
`requireAdmin`). Немає в `admin_users` → `403 Forbidden`, є → доступ до
`/api/admin/*`. `DEV_AUTH` для цієї перевірки не має жодного значення — він
лише замінює crypto-валідацію initData на фіксований dev-профіль, а сам
адмінський статус завжди йде через реальний запис у БД.

### Як призначити адміністратора

1. Спершу людина має хоч раз відкрити звичайний Mini App або адмінку через
   Telegram (або через DEV_AUTH локально) — так з'явиться рядок у `users`.
2. Дізнайтесь її `telegram_id` (власний акаунт: [@userinfobot](https://t.me/userinfobot) в Telegram; або погляньте в таблицю `users` через `psql`).
3. Через `psql "$DATABASE_URL"` виконайте (підставивши реальний `telegram_id`):
   ```sql
   insert into admin_users (user_id)
   select id from users where telegram_id = 123456789
   on conflict (user_id) do nothing;
   ```
   Той самий запит — коментарем у кінці `database/migrations/0002_admin_users.sql`.
4. Прибрати права адміністратора — видалити відповідний рядок з `admin_users`:
   ```sql
   delete from admin_users where user_id = (select id from users where telegram_id = 123456789);
   ```

### Запуск

```bash
cp frontend/admin/.env.example frontend/admin/.env   # VITE_API_URL=/api, змінювати не треба
npm run dev --workspace=admin
```

Відкриється на `http://localhost:5174`. Використовує той самий backend
(`http://localhost:3000`) через Vite-проксі — окремо піднімати нічого не
треба, досить щоб `npm run dev --workspace=backend` вже працював.

## Безпека бази даних

- Frontend ніколи не звертається до Postgres напряму — весь трафік іде через backend API.
- `DATABASE_URL` — серверний секрет (повний доступ до бази). Ніколи не вставляйте його у frontend-код, не публікуйте, не комітьте в Git.

## Статус розробки

- [x] Етап 1 — базова структура монорепозиторію
- [x] Етап 2 — налаштування frontend
- [x] Етап 3 — UI на mock-даних
- [x] Етап 4 — backend (in-memory)
- [x] Етап 5 — PostgreSQL-схема та підключення Supabase
- [x] Етап 6 — підключення frontend до backend
- [x] Етап 7 — Telegram авторизація
- [x] Адмін-панель — окремий React SPA, `admin_users`, `requireAdmin`
- [ ] Етап 8 — перевірка створення подій та участі
- [ ] Етап 9 — підготовка до деплою
