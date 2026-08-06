import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { UserContext, type UserStatus } from './UserContext'
import type { AuthUser } from '../types/user'
import { fetchCurrentUser, getErrorMessage } from '../services/api'

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<UserStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchCurrentUser()
      .then((data) => {
        setUser(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })
  }, [])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const reload = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  return (
    <UserContext.Provider value={{ user, status, errorMessage, reload }}>
      {children}
    </UserContext.Provider>
  )
}
