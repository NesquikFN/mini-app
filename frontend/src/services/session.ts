/** Session token storage — the backend never sees cookies, just this
 * Bearer token (see services/api.ts). sessionStorage survives reloads but
 * clears when the Mini App/tab is closed, matching a Telegram session. */

const STORAGE_KEY = 'dormhub_session_token'

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Приватний режим браузера тощо — сесія просто не переживе reload.
  }
}

export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
