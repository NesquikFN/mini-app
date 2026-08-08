-- Постійний реєстр чатів/гілок бота, заповнюється вебхуком у реальному
-- часі. Замінює попередній підхід через getUpdates() — той віддавав лише
-- обмежене й нестабільне вікно останніх подій (активність в одному чаті
-- витісняла звідти інші, тихіші чати).
create table if not exists telegram_chats (
  chat_id text primary key,
  title text not null,
  type text not null check (type in ('group', 'supergroup', 'channel')),
  is_bot_member boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists telegram_topics (
  chat_id text not null references telegram_chats (chat_id) on delete cascade,
  thread_id text not null,
  title text not null,
  updated_at timestamptz not null default now(),
  primary key (chat_id, thread_id)
);
