import { useEffect } from 'react'
import { getTelegramWebApp } from '../services/telegram'

/** Mirrors an in-page back control onto Telegram's native chrome
 * BackButton, so Mini App users get the platform-native back gesture too.
 * No-op outside Telegram — the in-page button (see PageHeader) still works. */
export function useTelegramBackButton(active: boolean, onBack: () => void): void {
  useEffect(() => {
    const webApp = getTelegramWebApp()
    if (!webApp || !active) return

    webApp.BackButton.show()
    webApp.BackButton.onClick(onBack)

    return () => {
      webApp.BackButton.offClick(onBack)
      webApp.BackButton.hide()
    }
  }, [active, onBack])
}
