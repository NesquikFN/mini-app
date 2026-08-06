import { useContext } from 'react'
import { UserContext } from '../context/UserContext'

export function useCurrentUser() {
  const ctx = useContext(UserContext)
  if (!ctx) {
    throw new Error('useCurrentUser must be used within UserProvider')
  }
  return ctx
}
