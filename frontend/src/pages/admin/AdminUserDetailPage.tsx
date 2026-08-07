import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { EventCard } from '../../components/EventCard'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useTelegramBackButton } from '../../hooks/useTelegramBackButton'
import { fetchAdminUserDetail, getErrorMessage } from '../../services/api'
import type { AdminUserDetail } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    if (!id) return
    fetchAdminUserDetail(id)
      .then((data) => {
        setDetail(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [id])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  useTelegramBackButton(true, () => navigate('/admin/users'))

  if (!id) return null

  if (status === 'loading') {
    return <LoadingState label="Завантажуємо користувача…" />
  }

  if (status === 'error' || !detail) {
    return (
      <EmptyState
        title="Не вдалося завантажити користувача"
        description={errorMessage ?? undefined}
        actionLabel="Спробувати ще раз"
        onAction={retry}
      />
    )
  }

  const { user, stats, createdEvents, participatingEvents } = detail

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <Avatar name={user.firstName} photoUrl={user.photoUrl} size={56} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-neutral-900">
            {user.firstName}
            {user.lastName ? ` ${user.lastName}` : ''}
          </p>
          {user.username && <p className="text-sm text-neutral-500">@{user.username}</p>}
          <p className="font-mono text-xs text-neutral-400">telegram_id: {user.telegramId}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Створено подій" value={stats.createdEvents} />
        <StatBlock label="Бере участь" value={stats.participatingEvents} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Створені події</h2>
        {createdEvents.length === 0 ? (
          <EmptyState icon={<CalendarX size={28} />} title="Немає створених подій" />
        ) : (
          createdEvents.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Бере участь у подіях</h2>
        {participatingEvents.length === 0 ? (
          <EmptyState icon={<CalendarX size={28} />} title="Не бере участі в подіях" />
        ) : (
          participatingEvents.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </section>
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
      <p className="text-xl font-semibold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  )
}
