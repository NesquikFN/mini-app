import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { AuthContext, type AuthStatus } from './AuthContext'
import { EmptyState } from '../components/EmptyState'
import { SplashScreen } from '../components/SplashScreen'
import { authenticateWithTelegram, getErrorMessage } from '../services/api'
import { bootstrapTelegramWebApp, getTelegramInitData } from '../services/telegram'
import { setSessionToken, clearSessionToken } from '../services/session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('authenticating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Independent from `status`: the splash plays its own close-out
  // (current bounce -> final hop -> logo reveal -> fade) after status
  // resolves, rather than being torn down the instant auth settles.
  const [splashDone, setSplashDone] = useState(false)

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
    setSplashDone(false)
    runAuth()
  }, [runAuth])

  return (
    <>
      {/* Mounts as soon as auth succeeds — while the splash is still
          playing its exit animation on top, everything underneath
          (UserProvider/DormitoriesProvider/EventsProvider) is already
          fetching, so by the time the splash fades there is often
          nothing left to wait for. */}
      {status === 'authenticated' && (
        <AuthContext.Provider value={{ status, errorMessage, retry }}>
          {children}
        </AuthContext.Provider>
      )}

      {status === 'error' && splashDone && (
        <FullScreenCenter>
          <EmptyState
            icon={<ShieldAlert size={40} />}
            title="Не вдалося підтвердити Telegram-користувача."
            description={errorMessage ?? undefined}
            actionLabel="Спробувати ще раз"
            onAction={retry}
          />
        </FullScreenCenter>
      )}

      {!splashDone && (
        <SplashScreen
          appState={status === 'authenticated' ? 'ready' : status === 'error' ? 'error' : 'loading'}
          onFinished={() => setSplashDone(true)}
        />
      )}
    </>
  )
}

function FullScreenCenter({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center bg-neutral-50 px-4">
      {children}
    </div>
  )
}
