export {}

/**
 * Minimal typed surface of the official Telegram Mini Apps WebApp object,
 * covering only what this app actually uses. Full reference:
 * https://core.telegram.org/bots/webapps#initializing-mini-apps
 */
interface TelegramWebAppThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

interface TelegramWebAppBackButton {
  isVisible: boolean
  show(): void
  hide(): void
  onClick(callback: () => void): void
  offClick(callback: () => void): void
}

interface TelegramWebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

interface TelegramWebAppInitDataUnsafe {
  user?: TelegramWebAppUser
  auth_date?: number
  hash?: string
  /** Passed through from a t.me/<bot>?startapp=<value> deep link — see
   * sendEventAnnouncement's "🎉 Приєднатися" button in the backend. */
  start_param?: string
  [key: string]: unknown
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: TelegramWebAppInitDataUnsafe
  /** Версія Bot API, яку підтримує клієнт (напр. "8.0"). */
  version?: string
  colorScheme: 'light' | 'dark'
  themeParams: TelegramWebAppThemeParams
  BackButton: TelegramWebAppBackButton
  HapticFeedback?: TelegramHapticFeedback
  ready(): void
  expand(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  /** Повертає true, якщо клієнт підтримує вказану версію Bot API або
   * новішу. Єдиний надійний спосіб перевірити наявність shareMessage /
   * shareToStory ДО виклику. */
  isVersionAtLeast?(version: string): boolean
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  openTelegramLink?(url: string): void
  /**
   * Bot API 8.0+. Відкриває діалог вибору чату для повідомлення, яке бот
   * заздалегідь зберіг через savePreparedInlineMessage. `msg_id` — це
   * PreparedInlineMessage.id з Bot API; callback отримує boolean —
   * чи повідомлення справді надіслали.
   */
  shareMessage?(msgId: string, callback?: (sent: boolean) => void): void
  /**
   * Bot API 7.8+. Відкриває нативний редактор історій із медіа за
   * HTTPS-URL. URL має бути публічно доступним для клієнта.
   */
  shareToStory?(mediaUrl: string, params?: TelegramStoryShareParams): void
  /** Bot API 7.7+. Stops an accidental swipe-down on page content from
   * collapsing/closing the Mini App. Older clients don't have it. */
  disableVerticalSwipes?(): void
  /** Bot API 6.2+. Fallback for clients without disableVerticalSwipes —
   * shows an "are you sure?" prompt before the app actually closes. */
  enableClosingConfirmation?(): void
}

/** Bot API 7.8+. Параметри shareToStory — назви полів точно як в
 * офіційній документації Mini Apps (StoryShareParams / StoryWidgetLink). */
interface TelegramStoryWidgetLink {
  url: string
  /** Підпис віджета, 0-48 символів. */
  name?: string
}

interface TelegramStoryShareParams {
  /** Підпис до історії: 0-200 символів (0-2048 для Premium). */
  text?: string
  widget_link?: TelegramStoryWidgetLink
}

/** Bot API 6.1+. */
interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
