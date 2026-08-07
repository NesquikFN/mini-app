import { useContext } from 'react'
import { AdminStatusContext } from '../context/AdminStatusContext'

export function useAdminStatus() {
  const ctx = useContext(AdminStatusContext)
  if (!ctx) {
    throw new Error('useAdminStatus must be used within AdminStatusProvider')
  }
  return ctx
}
