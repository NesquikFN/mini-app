import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import {
  fetchMyNotificationSettings,
  getErrorMessage,
  updateMyNotificationSettings,
  type PersonalNotificationSettings,
} from '../services/api'

// Свідомо вужче за PersonalNotificationSettings: newRegistrationsEnabled
// стосується лише адмінів і показується в розділі «Заявки», а не тут.
type SettingKey = 'newEventsEnabled' | 'joinConfirmationEnabled' | 'organizerJoinEnabled'

const LABELS: Record<SettingKey, string> = {
  newEventsEnabled: 'Нові події',
  joinConfirmationEnabled: 'Підтвердження участі',
  organizerJoinEnabled: 'Нові учасники моїх подій',
}

const ORDER: SettingKey[] = ['newEventsEnabled', 'joinConfirmationEnabled', 'organizerJoinEnabled']

/**
 * Блок «Сповіщення» у профілі. Джерело правди — виключно backend
 * (GET/PATCH /api/me/notifications): жодного localStorage, стан завжди
 * підвантажується заново при монтуванні, тож переживає reload сам по
 * собі. Кожен перемикач зберігається одразу при кліку, оптимістично
 * оновлюючи UI й відкочуючи його назад, якщо запит не вдався.
 */
export function NotificationSettingsCard() {
  const [settings, setSettings] = useState<PersonalNotificationSettings | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null)

  useEffect(() => {
    fetchMyNotificationSettings()
      .then((data) => {
        setSettings(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  async function handleToggle(key: SettingKey) {
    if (!settings || savingKey) return
    const previous = settings
    const next = { ...settings, [key]: !settings[key] }
    setSavingKey(key)
    setErrorMessage(null)
    setSettings(next)
    try {
      setSettings(await updateMyNotificationSettings({ [key]: next[key] }))
    } catch (error) {
      setSettings(previous)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setSavingKey(null)
    }
  }

  // Необов'язковий блок: поки не завантажився чи не вдалося — тихо не
  // показуємо нічого, а не ламаємо решту сторінки профілю скелетоном чи
  // помилкою.
  if (status !== 'success' || !settings) return null

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Сповіщення</h2>
      <div className="flex flex-col gap-2">
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleToggle(key)}
            disabled={savingKey !== null}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3.5 py-3 text-left disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              {settings[key] ? (
                <Bell size={16} className="text-[var(--accent)]" />
              ) : (
                <BellOff size={16} className="text-[var(--text-secondary)]" />
              )}
              {LABELS[key]}
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                settings[key] ? 'bg-[var(--accent)]' : 'bg-[var(--surface-border)]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  settings[key] ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        ))}
      </div>
      {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
    </section>
  )
}
