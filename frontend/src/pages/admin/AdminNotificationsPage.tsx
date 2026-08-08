import { useCallback, useEffect, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { Button } from '../../components/Button'
import { LoadingState } from '../../components/LoadingState'
import {
  fetchAdminNotificationChats,
  fetchAdminNotificationTopics,
  fetchNotificationSettings,
  getErrorMessage,
  updateNotificationSettings,
  type TelegramChatOption,
  type TelegramTopicOption,
} from '../../services/api'

export function AdminNotificationsPage() {
  const [chats, setChats] = useState<TelegramChatOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [topics, setTopics] = useState<TelegramTopicOption[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTopics = useCallback((chatId: string, initialTopicId?: string, initialTopicTitle?: string) => {
    if (!chatId) {
      setTopics([])
      setSelectedTopicId('')
      return
    }
    setTopicsLoading(true)
    fetchAdminNotificationTopics(chatId)
      .then((availableTopics) => {
        setTopics(availableTopics)
        setSelectedTopicId(initialTopicId ?? '')
        if (initialTopicId && !availableTopics.some((topic) => topic.id === initialTopicId)) {
          setTopics((current) => [
            { id: initialTopicId, title: initialTopicTitle ?? initialTopicId },
            ...current,
          ])
        }
      })
      .catch((topicsError: unknown) => setError(getErrorMessage(topicsError)))
      .finally(() => setTopicsLoading(false))
  }, [])

  const load = useCallback(() => {
    Promise.all([fetchAdminNotificationChats(), fetchNotificationSettings()])
      .then(([availableChats, settings]) => {
        setChats(availableChats)
        setSelectedId(settings.chatId ?? '')
        if (settings.chatId && !availableChats.some((chat) => chat.id === settings.chatId)) {
          setChats((current) => [{
            id: settings.chatId!,
            title: settings.chatTitle ?? settings.chatId!,
            type: 'group',
          }, ...current])
        }
        if (settings.chatId) loadTopics(settings.chatId, settings.threadId, settings.threadTitle)
      })
      .catch((loadError: unknown) => setError(getErrorMessage(loadError)))
      .finally(() => setLoading(false))
  }, [loadTopics])

  useEffect(() => {
    load()
  }, [load])

  function refresh() {
    setLoading(true)
    setError(null)
    load()
  }

  function selectChat(chatId: string) {
    setSelectedId(chatId)
    loadTopics(chatId)
  }

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const chat = chats.find((item) => item.id === selectedId)
      const topic = chat ? topics.find((item) => item.id === selectedTopicId) : undefined
      await updateNotificationSettings(chat, topic)
      setMessage(chat
        ? `Усі нові події надсилатимуться в «${chat.title}»${topic ? `, гілка «${topic.title}»` : ''}.`
        : 'Автоматичні сповіщення вимкнено.')
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Завантажуємо налаштування…" />

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Сповіщення про події</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Обраний чат використовується автоматично для кожної нової події.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Telegram-чат
          <select
            value={selectedId}
            onChange={(event) => selectChat(event.target.value)}
            className="h-12 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Не надсилати сповіщення</option>
            {chats.map((chat) => <option key={chat.id} value={chat.id}>{chat.title}</option>)}
          </select>
        </label>

        {selectedId && (topicsLoading || topics.length > 0) && (
          <label className="flex flex-col gap-2 text-sm font-medium">
            Гілка (тема) у чаті
            <select
              value={selectedTopicId}
              onChange={(event) => setSelectedTopicId(event.target.value)}
              disabled={topicsLoading}
              className="h-12 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
            >
              <option value="">Загальна тема чату</option>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
            </select>
          </label>
        )}

        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          Додайте бота до групи або каналу, дозвольте йому надсилати повідомлення та напишіть у чат (або в потрібній гілці, якщо в групі увімкнені теми). Потім натисніть «Оновити список».
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw size={16} /> Оновити список
          </Button>
          <Button onClick={save} loading={saving}>
            <Bell size={16} /> Зберегти
          </Button>
        </div>
      </section>

      {message && <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</p>}
      {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
    </div>
  )
}
