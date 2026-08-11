import { useState } from 'react'
import { Check, Link2, Loader2, Send, Sparkles } from 'lucide-react'
import {
  createEventShareCard,
  createEventShareMessage,
  fetchEventShareLink,
  getErrorMessage,
} from '../services/api'
import { getTelegramWebApp } from '../services/telegram'

/**
 * Bottom sheet «Поділитися подією» — відкривається з наявної кнопки
 * «Запросити» на EventDetailPage. Окремого маршруту немає навмисно.
 *
 * Три способи, кожен зі своїм fallback:
 *  - «Надіслати в чат» — prepared inline message (Bot API 8.0) через
 *    WebApp.shareMessage; якщо клієнт старий або Bot API повернув
 *    помилку, лишається перевірений t.me/share/url;
 *  - «Додати в історію» — WebApp.shareToStory (Bot API 7.8); на
 *    клієнтах без підтримки кнопка disabled із поясненням;
 *  - «Скопіювати посилання» — працює всюди, включно з браузером поза
 *    Telegram.
 */

/** Версії Bot API, у яких з'явились потрібні методи (офіційна
 * документація Mini Apps). */
const SHARE_MESSAGE_MIN_VERSION = '8.0'
const SHARE_TO_STORY_MIN_VERSION = '7.8'

type ShareAction = 'chat' | 'story' | 'copy'

interface ShareEventSheetProps {
  eventId: string
  eventTitle: string
  locked: boolean
  onClose: () => void
}

function supportsVersion(minVersion: string): boolean {
  const webApp = getTelegramWebApp()
  if (!webApp) return false
  // isVersionAtLeast — єдина офіційна перевірка; наявність самого методу
  // ще не гарантує, що клієнт його реально виконає.
  return typeof webApp.isVersionAtLeast === 'function' && webApp.isVersionAtLeast(minVersion)
}

function haptic(type: 'success' | 'error'): void {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type)
}

export function ShareEventSheet({ eventId, eventTitle, locked, onClose }: ShareEventSheetProps) {
  const [pending, setPending] = useState<ShareAction | null>(null)
  const [copied, setCopied] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const storySupported = supportsVersion(SHARE_TO_STORY_MIN_VERSION)
  // Назва VIP/ГПУ-події не повинна потрапити ані в картку, ані в
  // супровідний текст: переслати його можна й у звичайний публічний чат.
  const publicTitle = locked ? 'Закрита подія DormHub' : eventTitle

  /** Запасний шлях — той самий, що працював до карток: звичайне
   * посилання-запрошення з коректним deep link. */
  async function shareViaLink(): Promise<void> {
    const eventUrl = await fetchEventShareLink(eventId)
    const shareUrl = new URL('https://t.me/share/url')
    shareUrl.searchParams.set('url', eventUrl)
    shareUrl.searchParams.set('text', `🎉 ${publicTitle}\nПриєднуйся до події в DormHub!`)

    const webApp = getTelegramWebApp()
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(shareUrl.toString())
    } else {
      window.open(shareUrl.toString(), '_blank', 'noopener,noreferrer')
    }
  }

  async function handleShareToChat(): Promise<void> {
    if (pending) return
    setPending('chat')
    setErrorMessage(null)
    try {
      const webApp = getTelegramWebApp()
      if (supportsVersion(SHARE_MESSAGE_MIN_VERSION) && webApp?.shareMessage) {
        const { preparedMessageId } = await createEventShareMessage(eventId)
        const sent = await new Promise<boolean>((resolve) => {
          webApp.shareMessage?.(preparedMessageId, resolve)
        })
        // false означає, що користувач закрив системний діалог. Це не
        // помилка й не привід автоматично відкривати запасний share URL.
        if (!sent) return
      } else {
        await shareViaLink()
      }
      haptic('success')
      onClose()
    } catch (error) {
      // Bot API міг відмовити (старий клієнт, тимчасова помилка) — не
      // лишаємо користувача ні з чим, а пробуємо звичайне посилання.
      try {
        await shareViaLink()
        haptic('success')
        onClose()
      } catch {
        haptic('error')
        setErrorMessage(getErrorMessage(error))
      }
    } finally {
      setPending(null)
    }
  }

  async function handleShareToStory(): Promise<void> {
    if (pending || !storySupported) return
    setPending('story')
    setErrorMessage(null)
    try {
      const [{ url }, eventUrl] = await Promise.all([
        createEventShareCard(eventId, 'story'),
        fetchEventShareLink(eventId),
      ])
      getTelegramWebApp()?.shareToStory?.(url, {
        text: `🎉 ${publicTitle}`,
        widget_link: { url: eventUrl, name: 'Приєднатися' },
      })
      haptic('success')
      onClose()
    } catch (error) {
      haptic('error')
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPending(null)
    }
  }

  async function handleCopyLink(): Promise<void> {
    if (pending) return
    setPending('copy')
    setErrorMessage(null)
    try {
      const eventUrl = await fetchEventShareLink(eventId)
      await navigator.clipboard.writeText(eventUrl)
      setCopied(true)
      haptic('success')
      // Лишаємо аркуш відкритим на мить, щоб користувач побачив
      // підтвердження, і закриваємо самі.
      window.setTimeout(onClose, 1200)
    } catch (error) {
      haptic('error')
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-[dormhub-fade-in_0.15s_ease]"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[560px] flex-col rounded-t-3xl border-t border-[var(--surface-border)] bg-[var(--surface-card)] pb-[max(1rem,env(safe-area-inset-bottom))] animate-[dormhub-slide-up_0.2s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Поділитися подією</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[var(--accent)] active:text-[var(--accent-hover)]"
          >
            Закрити
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 py-4">
          <ShareOption
            icon={<Send size={20} />}
            label="Надіслати в чат"
            description="Картка події з кнопкою приєднання"
            loading={pending === 'chat'}
            disabled={pending !== null}
            onClick={handleShareToChat}
          />

          <ShareOption
            icon={<Sparkles size={20} />}
            label="Додати в історію"
            description={
              storySupported
                ? 'Вертикальна картка для Stories'
                : 'Ваша версія Telegram не підтримує історії'
            }
            loading={pending === 'story'}
            disabled={pending !== null || !storySupported}
            onClick={handleShareToStory}
          />

          <ShareOption
            icon={copied ? <Check size={20} /> : <Link2 size={20} />}
            label={copied ? 'Посилання скопійовано' : 'Скопіювати посилання'}
            description="Працює будь-де"
            loading={pending === 'copy'}
            disabled={pending !== null}
            highlighted={copied}
            onClick={handleCopyLink}
          />

          {errorMessage && (
            <p className="mt-1 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ShareOption({
  icon,
  label,
  description,
  loading,
  disabled,
  highlighted = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  loading: boolean
  disabled: boolean
  highlighted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${
        highlighted
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-[var(--surface-border)] bg-[var(--surface-card-alt)]'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          highlighted
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-[var(--accent-soft-bg)] text-[var(--accent)]'
        }`}
      >
        {loading ? <Loader2 size={20} className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="block text-xs text-[var(--text-secondary)]">{description}</span>
      </span>
    </button>
  )
}
