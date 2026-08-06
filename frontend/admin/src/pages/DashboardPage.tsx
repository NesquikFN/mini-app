import { useEffect, useState } from 'react'
import { Users, CalendarDays, CalendarCheck, UserCheck, Ticket } from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { fetchStats, getErrorMessage } from '../services/api'
import type { AdminStats } from '../types/stats'

type Status = 'loading' | 'success' | 'error'

export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
      .then((data) => {
        setStats(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900">Дашборд</h1>

      {status === 'loading' && <LoadingState label="Завантажуємо статистику…" />}

      {status === 'error' && (
        <EmptyState title="Не вдалося завантажити статистику" description={errorMessage ?? undefined} />
      )}

      {status === 'success' && stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Усього користувачів" value={stats.totalUsers} icon={<Users size={22} />} />
          <StatCard label="Усього подій" value={stats.totalEvents} icon={<CalendarDays size={22} />} />
          <StatCard label="Подій сьогодні" value={stats.eventsToday} icon={<CalendarCheck size={22} />} />
          <StatCard label="Усього участей" value={stats.totalParticipations} icon={<Ticket size={22} />} />
          <StatCard label="Активних користувачів" value={stats.activeUsers} icon={<UserCheck size={22} />} />
        </div>
      )}
    </div>
  )
}
