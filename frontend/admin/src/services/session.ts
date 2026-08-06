/** Session token storage for the admin app — a distinct key from the
 * user-facing Mini App's (see frontend/src/services/session.ts) so the
 * two never collide if ever loaded from the same browser profile. */

const STORAGE_KEY = 'dormhub_admin_session_token'

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
