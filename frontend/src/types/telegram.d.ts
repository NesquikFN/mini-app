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
  colorScheme: 'light' | 'dark'
  themeParams: TelegramWebAppThemeParams
  BackButton: TelegramWebAppBackButton
  ready(): void
  expand(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  openTelegramLink?(url: string): void
  /** Bot API 7.7+. Stops an accidental swipe-down on page content from
   * collapsing/closing the Mini App. Older clients don't have it. */
  disableVerticalSwipes?(): void
  /** Bot API 6.2+. Fallback for clients without disableVerticalSwipes —
   * shows an "are you sure?" prompt before the app actually closes. */
  enableClosingConfirmation?(): void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
