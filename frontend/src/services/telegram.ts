/** Thin wrapper around window.Telegram.WebApp — the official Mini Apps SDK,
 * loaded via the <script> tag in index.html (not an npm package, per
 * Telegram's own docs: https://core.telegram.org/bots/webapps). */

export function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null
}

export function isRunningInTelegram(): boolean {
  return getTelegramWebApp() !== null
}

/** Raw, signed payload for backend validation. Never trust
 * `initDataUnsafe` for auth — only this string, verified server-side. */
export function getTelegramInitData(): string | undefined {
  const webApp = getTelegramWebApp()
  return webApp?.initData ? webApp.initData : undefined
}

/** The `?startapp=` value from the t.me deep link that opened this Mini
 * App session, if any — e.g. "event_<uuid>" from a group announcement's
 * "🎉 Приєднатися" button. Not signed, so only ever used for navigation,
 * never trusted as auth or data. */
export function getTelegramStartParam(): string | undefined {
  return getTelegramWebApp()?.initDataUnsafe.start_param
}

/** Mini App bootstrap: signal readiness and expand to full height. Safe
 * no-op outside Telegram (plain browser during local development). */
export function bootstrapTelegramWebApp(): void {
  const webApp = getTelegramWebApp()
  if (!webApp) return

  webApp.ready()
  webApp.expand()

  // На мобільних свайп вниз по контенту закривав Mini App — це і є
  // "постійно зачиняю вкладку". disableVerticalSwipes прибирає жест
  // повністю; enableClosingConfirmation — підстраховка для клієнтів,
  // де цього методу ще нема (просить підтвердження перед закриттям).
  try {
    webApp.disableVerticalSwipes?.()
    webApp.enableClosingConfirmation?.()
  } catch {
    // Старі клієнти Telegram — не критично.
  }

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
