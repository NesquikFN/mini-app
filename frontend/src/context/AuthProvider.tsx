import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { AuthContext, type AuthStatus } from './AuthContext'
import { EmptyState } from '../components/EmptyState'
import { SplashScreen } from '../components/SplashScreen'
import { ApiError, authenticateWithTelegram, getErrorMessage } from '../services/api'
import { bootstrapTelegramWebApp, getTelegramInitData } from '../services/telegram'
import { setSessionToken, clearSessionToken } from '../services/session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('authenticating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [accessBlocked, setAccessBlocked] = useState(false)
  // Independent from `status`: the splash plays its own close-out
  // (current bounce -> final hop -> logo reveal -> fade) after status
  // resolves, rather than being torn down the instant auth settles.
  const [splashDone, setSplashDone] = useState(false)

  const runAuth = useCallback(() => {
    bootstrapTelegramWebApp()
    const initData = getTelegramInitData()

    authenticateWithTelegram(initData)
      .then(async ({ token }) => {
        // DEV-only diagnostic: ?debugRealSplash=<ms> artificially delays
        // appReady on the REAL AuthProvider/SplashScreen lifecycle, to
        // reproduce timing-dependent bugs that a near-instant local
        // dev-auth response never exercises. Never active in production
        // builds (import.meta.env.DEV is statically false there) and
        // never changes what actually gets authenticated — only when
        // `setStatus('authenticated')` fires.
        if (import.meta.env.DEV) {
          const raw = new URLSearchParams(location.search).get('debugRealSplash')
          if (raw !== null) {
            const ms = Number(raw) || 1000

            console.log(`[AuthProvider] debugRealSplash: delaying appReady by ${ms}ms`)
            await new Promise((resolve) => setTimeout(resolve, ms))
          }
        }
        setSessionToken(token)
        setStatus('authenticated')
      })
      .catch((error: unknown) => {
        clearSessionToken()
        setAccessBlocked(error instanceof ApiError && error.code === 'USER_BANNED')
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
    setAccessBlocked(false)
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
            title={accessBlocked ? 'Доступ заблоковано' : 'Не вдалося підтвердити Telegram-користувача.'}
            description={errorMessage ?? undefined}
            actionLabel={accessBlocked ? undefined : 'Спробувати ще раз'}
            onAction={accessBlocked ? undefined : retry}
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
