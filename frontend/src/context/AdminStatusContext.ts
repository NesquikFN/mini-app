import { createContext } from 'react'

export type AdminStatusValue = 'loading' | 'admin' | 'not-admin' | 'error'

export interface AdminStatusContextValue {
  status: AdminStatusValue
  recheck: () => void
}

export const AdminStatusContext = createContext<AdminStatusContextValue | null>(null)
