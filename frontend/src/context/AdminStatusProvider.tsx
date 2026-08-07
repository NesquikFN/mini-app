import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AdminStatusContext, type AdminStatusValue } from './AdminStatusContext'
import { ApiError, fetchAdminCheck } from '../services/api'

/** Фонова перевірка "чи адмін цей користувач" — GET /api/admin/check.
 * Ніколи не блокує рендер решти застосунку (на відміну від AuthProvider):
 * поки статус ще 'loading', звичайний Mini App UI вже показується, просто
 * без посилання на адмінку. Реальний захист усе одно на бекенді
 * (requireTelegramAuth + requireAdmin) — це лише для UX. */
export function AdminStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminStatusValue>('loading')

  const runCheck = useCallback(() => {
    fetchAdminCheck()
      .then(() => setStatus('admin'))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setStatus('not-admin')
          return
        }
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    runCheck()
  }, [runCheck])

  const recheck = useCallback(() => {
    setStatus('loading')
    runCheck()
  }, [runCheck])

  return (
    <AdminStatusContext.Provider value={{ status, recheck }}>
      {children}
    </AdminStatusContext.Provider>
  )
}
