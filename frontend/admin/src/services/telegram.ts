/** Thin wrapper around window.Telegram.WebApp — the official Mini Apps SDK,
 * loaded via the <script> tag in index.html (not an npm package, per
 * Telegram's own docs: https://core.telegram.org/bots/webapps). Same
 * pattern as frontend/src/services/telegram.ts; kept separate because the
 * admin panel is a genuinely separate app (see README "Адмін-панель"). */

export function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null
}

/** Raw, signed payload for backend validation. Never trust
 * `initDataUnsafe` for auth — only this string, verified server-side. */
export function getTelegramInitData(): string | undefined {
  const webApp = getTelegramWebApp()
  return webApp?.initData ? webApp.initData : undefined
}

/** Mini App bootstrap: signal readiness. Safe no-op outside Telegram
 * (plain browser during local development). */
export function bootstrapTelegramWebApp(): void {
  const webApp = getTelegramWebApp()
  if (!webApp) return

  webApp.ready()
  webApp.expand()

  try {
    const bgColor = webApp.themeParams.bg_color
    if (bgColor) {
      webApp.setHeaderColor(bgColor)
      webApp.setBackgroundColor(bgColor)
    }
  } catch {
    // themeParams / setHeaderColor можуть бути недоступні в старих
    // клієнтах Telegram — це суто косметика, не критично для роботи.
  }
}
