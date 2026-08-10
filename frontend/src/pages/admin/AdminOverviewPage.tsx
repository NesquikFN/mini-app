import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Users, UserCheck, CalendarDays, CalendarCheck, Ticket } from 'lucide-react'
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
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Огляд</h1>

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
          <StatCard label="Зареєстровані" value={stats.registeredUsers} icon={<UserCheck size={20} />} />
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
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
        {icon}
      </span>
      <div>
        <p className="text-xl font-semibold text-[var(--text-primary)]">{value}</p>
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      </div>
    </div>
  )
}
