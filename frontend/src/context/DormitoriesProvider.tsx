import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DormitoriesContext, type DormitoriesStatus } from './DormitoriesContext'
import type { Dormitory } from '../types/dormitory'
import { fetchDormitories, getErrorMessage } from '../services/api'

/** Список гуртожитків завантажується з backend один раз при старті
 * застосунку (GET /api/dormitories) і кешується тут — жоден компонент не
 * хардкодить ні кількість, ні назви (DormitorySelector, DormitoryGate,
 * EventCard, EventDetailPage, ProfilePage, адмін-панель усі читають
 * звідси). */
export function DormitoriesProvider({ children }: { children: ReactNode }) {
  const [dormitories, setDormitories] = useState<Dormitory[]>([])
  const [status, setStatus] = useState<DormitoriesStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchDormitories()
      .then((data) => {
        setDormitories(data)
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

  const getDormitoryName = useCallback(
    (id: string | undefined) => {
      if (!id) return ''
      return dormitories.find((dormitory) => dormitory.id === id)?.name ?? ''
    },
    [dormitories],
  )

  const value = useMemo(
    () => ({ dormitories, status, errorMessage, reload, getDormitoryName }),
    [dormitories, status, errorMessage, reload, getDormitoryName],
  )

  return (
    <DormitoriesContext.Provider value={value}>{children}</DormitoriesContext.Provider>
  )
}
