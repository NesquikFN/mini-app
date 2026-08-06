import { createContext } from 'react'
import type { AuthUser } from '../types/user'

export type UserStatus = 'loading' | 'success' | 'error'

export interface UserContextValue {
  user: AuthUser | null
  status: UserStatus
  errorMessage: string | null
  reload: () => void
}

export const UserContext = createContext<UserContextValue | null>(null)
