import { createContext } from 'react'

export type AuthStatus = 'authenticating' | 'authenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  errorMessage: string | null
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
