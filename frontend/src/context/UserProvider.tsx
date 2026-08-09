import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { UserContext, type UserStatus } from './UserContext'
import type { AuthUser, SubmitRegistrationInput, UpdateProfileInput } from '../types/user'
import { fetchCurrentUser, getErrorMessage, submitMyRegistration, updateMyProfile } from '../services/api'

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

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const updated = await updateMyProfile(input)
    setUser(updated)
    return updated
  }, [])

  const submitRegistration = useCallback(async (input: SubmitRegistrationInput) => {
    const updated = await submitMyRegistration(input)
    setUser(updated)
    return updated
  }, [])

  return (
    <UserContext.Provider value={{ user, status, errorMessage, reload, updateProfile, submitRegistration }}>
      {children}
    </UserContext.Provider>
  )
}
