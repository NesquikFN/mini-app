import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert, ShieldX } from 'lucide-react'
import { AuthContext, type AuthStatus } from './AuthContext'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { ApiError, authenticateWithTelegram, fetchStats, getErrorMessage } from '../services/api'
import { bootstrapTelegramWebApp, getTelegramInitData } from '../services/telegram'
import { setSessionToken, clearSessionToken } from '../services/session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('authenticating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runAuth = useCallback(() => {
    bootstrapTelegramWebApp()
    const initData = getTelegramInitData()

    authenticateWithTelegram(initData)
      .then(({ token }) => {
        setSessionToken(token)
        // Успішна Telegram-автентифікація ще не означає права адміна —
        // requireAdmin на бекенді перевіряє admin_users окремо. Пробний
        // виклик підтверджує це до того, як показати інтерфейс.
        return fetchStats()
      })
      .then(() => {
        setStatus('authenticated')
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setStatus('forbidden')
          return
        }
        clearSessionToken()
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    runAuth()
  }, [runAuth])

  const retry = useCallback(() => {
    setStatus('authenticating')
    setErrorMessage(null)
    runAuth()
  }, [runAuth])

  if (status === 'authenticating') {
    return (
      <FullScreenCenter>
        <LoadingState label="Підключення до Telegram…" />
      </FullScreenCenter>
    )
  }

  if (status === 'forbidden') {
    return (
      <FullScreenCenter>
        <EmptyState
          icon={<ShieldX size={40} />}
          title="Доступ заборонено"
          description="У вас немає прав адміністратора DormHub."
        />
      </FullScreenCenter>
    )
  }

  if (status === 'error') {
    return (
      <FullScreenCenter>
        <EmptyState
          icon={<ShieldAlert size={40} />}
          title="Не вдалося підтвердити Telegram-користувача."
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      </FullScreenCenter>
    )
  }

  return (
    <AuthContext.Provider value={{ status, errorMessage, retry }}>
      {children}
    </AuthContext.Provider>
  )
}

function FullScreenCenter({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-neutral-100 px-4">
      {children}
    </div>
  )
}
