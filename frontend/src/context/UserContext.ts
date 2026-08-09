import { createContext } from 'react'
import type { AuthUser, SubmitRegistrationInput, UpdateProfileInput } from '../types/user'

export type UserStatus = 'loading' | 'success' | 'error'

export interface UserContextValue {
  user: AuthUser | null
  status: UserStatus
  errorMessage: string | null
  reload: () => void
  updateProfile: (input: UpdateProfileInput) => Promise<AuthUser>
  submitRegistration: (input: SubmitRegistrationInput) => Promise<AuthUser>
}

export const UserContext = createContext<UserContextValue | null>(null)
