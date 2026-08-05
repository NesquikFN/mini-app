# DormHub

Telegram Mini App для мешканців гуртожитку. Дозволяє переглядати події, створювати власні, приєднуватися до них та переглядати профіль.

> Проект перебуває на ранньому етапі розробки (Етап 1: базова структура монорепозиторію).

## Технології

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Telegram Mini Apps API
- **Backend:** Node.js, Express, TypeScript
- **База даних:** Supabase (PostgreSQL)
- **Інше:** ESLint, Prettier, Git, dotenv

## Структура проекту

```text
dormhub/
├── frontend/     # React-застосунок (Telegram Mini App)
├── backend/      # Express API
├── database/     # SQL-схема та seed-дані для Supabase
├── .gitignore
├── README.md
└── package.json  # npm workspaces (frontend + backend)
```

## Встановлення

Розділи "Frontend", "Backend" та "Supabase" будуть доповнені на відповідних етапах розробки.

## Статус розробки

- [x] Етап 1 — базова структура монорепозиторію
- [ ] Етап 2 — налаштування frontend
- [ ] Етап 3 — UI на mock-даних
- [ ] Етап 4 — backend
- [ ] Етап 5 — PostgreSQL-схема для Supabase
- [ ] Етап 6 — підключення frontend до backend
- [ ] Етап 7 — Telegram авторизація
- [ ] Етап 8 — перевірка створення подій та участі
- [ ] Етап 9 — підготовка до деплою
