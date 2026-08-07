import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Users, CalendarDays, CalendarCheck, Ticket } from 'lucide-react'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { fetchAdminStats, getErrorMessage } from '../../services/api'
import type { AdminStats } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchAdminStats()
      .then((data) => {
        setStats(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-neutral-900">Огляд</h1>

      {status === 'loading' && <LoadingState label="Завантажуємо статистику…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити статистику"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Користувачі" value={stats.users} icon={<Users size={20} />} />
          <StatCard label="Події" value={stats.events} icon={<CalendarDays size={20} />} />
          <StatCard label="Активні" value={stats.activeEvents} icon={<CalendarCheck size={20} />} />
          <StatCard label="Участі" value={stats.participants} icon={<Ticket size={20} />} />
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
        {icon}
      </span>
      <div>
        <p className="text-xl font-semibold text-neutral-900">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  )
}
