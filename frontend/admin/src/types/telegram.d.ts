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
  [key: string]: unknown
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: TelegramWebAppInitDataUnsafe
  colorScheme: 'light' | 'dark'
  themeParams: TelegramWebAppThemeParams
  ready(): void
  expand(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
