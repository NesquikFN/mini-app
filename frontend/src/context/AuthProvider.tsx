import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { AuthContext, type AuthStatus } from './AuthContext'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { authenticateWithTelegram, getErrorMessage } from '../services/api'
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
        setStatus('authenticated')
      })
      .catch((error: unknown) => {
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
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center bg-neutral-50 px-4">
      {children}
    </div>
  )
}
