import { createContext } from 'react'
import type { Dormitory } from '../types/dormitory'

export type DormitoriesStatus = 'loading' | 'success' | 'error'

export interface DormitoriesContextValue {
  dormitories: Dormitory[]
  status: DormitoriesStatus
  errorMessage: string | null
  reload: () => void
  /** Резолвить id → назву гуртожитку, поки список ще не завантажено чи
   * якщо гуртожиток не знайдено — повертає порожній рядок, а не кидає. */
  getDormitoryName: (id: string | undefined) => string
}

export const DormitoriesContext = createContext<DormitoriesContextValue | null>(null)
