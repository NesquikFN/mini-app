import type { SocialLinks as SocialLinksType } from '../services/api'

const ICON_BUTTON_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] text-[var(--accent)] transition-transform active:scale-[0.94] active:bg-[var(--surface-card-alt)]'

/** Іконки-посилання на Discord/Telegram-спільноти в шапці головного
 * екрана — адмін керує URL через /admin (AdminNotificationsPage).
 * Іконка не рендериться, якщо відповідний URL не налаштований. */
export function SocialLinks({ links }: { links: SocialLinksType | undefined }) {
  if (!links?.discordUrl && !links?.telegramUrl) return null

  return (
    <div className="w-[142px] shrink-0">
      <div className="flex items-center justify-end gap-2">
        {links.telegramUrl && (
          <a
            href={links.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Наш Telegram"
            className={ICON_BUTTON_CLASS}
            onClick={(event) => {
              const openTelegramLink = window.Telegram?.WebApp?.openTelegramLink
              if (!openTelegramLink) return
              event.preventDefault()
              openTelegramLink.call(window.Telegram?.WebApp, links.telegramUrl as string)
            }}
          >
            <TelegramIcon />
          </a>
        )}
        {links.discordUrl && (
          <a
            href={links.discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Наш Discord"
            className={ICON_BUTTON_CLASS}
          >
            <DiscordIcon />
          </a>
        )}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none relative mt-1 h-10 text-[var(--accent)]"
      >
        <span
          className="absolute bottom-0 left-0 -rotate-3 whitespace-nowrap text-[15px] font-bold italic tracking-wide drop-shadow-[0_0_8px_rgba(255,122,0,0.25)]"
          style={{ fontFamily: "'Bradley Hand', 'Comic Sans MS', cursive" }}
        >
          Граємо тут
        </span>
        <svg
          width="52"
          height="39"
          viewBox="0 0 52 39"
          fill="none"
          className="absolute -top-1 right-0 overflow-visible drop-shadow-[0_0_5px_rgba(255,122,0,0.3)]"
        >
          <path
            d="M2 35C42 39 51 12 31 2"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M31 2 31.5 10M31 2l7 3.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}

function TelegramIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.05 3.87 2.94 10.9c-1.24.49-1.23 1.17-.23 1.48l4.63 1.45 1.79 5.44c.22.6.38.84.79.84.41 0 .59-.19.81-.4l1.94-1.88 4.03 2.98c.74.41 1.28.2 1.46-.68l2.66-12.51c.27-1.16-.44-1.68-1.27-1.35Z"
        fill="currentColor"
      />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19.27 5.33A18.27 18.27 0 0 0 14.9 4c-.2.36-.42.83-.58 1.2a16.9 16.9 0 0 0-4.64 0A8.3 8.3 0 0 0 9.1 4a18.2 18.2 0 0 0-4.37 1.33C2.1 9.03 1.4 12.63 1.75 16.18a18.4 18.4 0 0 0 5.52 2.75c.44-.6.84-1.24 1.18-1.92-.65-.24-1.27-.53-1.86-.88.16-.11.31-.23.46-.35a13.1 13.1 0 0 0 10.9 0c.15.12.3.24.46.35-.6.35-1.22.64-1.86.88.34.68.74 1.32 1.18 1.92a18.3 18.3 0 0 0 5.53-2.75c.42-4.1-.68-7.66-2.99-10.85ZM8.68 14.03c-1 0-1.82-.9-1.82-2.02s.8-2.02 1.82-2.02c1.02 0 1.84.91 1.82 2.02 0 1.11-.8 2.02-1.82 2.02Zm6.64 0c-1 0-1.82-.9-1.82-2.02s.8-2.02 1.82-2.02c1.02 0 1.84.91 1.82 2.02 0 1.11-.8 2.02-1.82 2.02Z"
        fill="currentColor"
      />
    </svg>
  )
}
