import { useContext } from 'react'
import { DormitoriesContext } from '../context/DormitoriesContext'

export function useDormitories() {
  const ctx = useContext(DormitoriesContext)
  if (!ctx) {
    throw new Error('useDormitories must be used within DormitoriesProvider')
  }
  return ctx
}
