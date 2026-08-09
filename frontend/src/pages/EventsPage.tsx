import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { PageHeader } from '../components/PageHeader'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { FilterTabs } from '../components/FilterTabs'
import type { EventsScope } from '../context/EventsContext'
import { isEventPast, isSameDay, isWithinNextDays } from '../utils/date'
import { useCurrentUser } from '../hooks/useCurrentUser'

type FilterValue = 'all' | 'today' | 'week' | 'online' | 'vip' | 'archive'

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Усі' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: 'Цього тижня' },
  { value: 'online', label: 'Онлайн' },
  { value: 'archive', label: 'Архів' },
]

const DORM_FILTER_OPTIONS: { value: EventsScope; label: string }[] = [
  { value: 'mine', label: 'Мій гуртожиток' },
  { value: 'all', label: 'Усі гуртожитки' },
]

export function EventsPage() {
  const { events, status, errorMessage, reload, scope, setScope } = useEvents()
  const { user } = useCurrentUser()
  const [filter, setFilter] = useState<FilterValue>('all')
  const location = useLocation()
  const navigate = useNavigate()
  const successMessage = (location.state as { successMessage?: string } | null)
    ?.successMessage

  useEffect(() => {
    if (!successMessage) return
    const timer = setTimeout(() => {
      navigate(location.pathname, { replace: true, state: {} })
    }, 3000)
    return () => clearTimeout(timer)
  }, [successMessage, navigate, location.pathname])

  // dormitory-фільтрація (scope) відбувається на backend — тут лишається
  // лише фільтр за датою, той самий client-side предикат, що й раніше.
  const filtered = events
    .filter((event) => {
      const isArchived = isEventPast(event.date, event.time)
      if (filter === 'archive') return isArchived
      if (isArchived) return false
      if (filter === 'today') return isSameDay(event.date, new Date())
      if (filter === 'week') return isWithinNextDays(event.date, 7)
      if (filter === 'online') return event.isOnline
      if (filter === 'vip') return event.vipOnly
      return true
    })
    .sort((a, b) =>
      filter === 'archive'
        ? (b.date + b.time).localeCompare(a.date + a.time)
        : (a.date + a.time).localeCompare(b.date + b.time),
    )

  return (
    <div className="flex flex-col">
      <PageHeader title="Події" />

      {successMessage && (
        <div className="mx-4 mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
          {successMessage}
        </div>
      )}

      <FilterTabs options={DORM_FILTER_OPTIONS} value={scope} onChange={setScope} />
      <FilterTabs
        options={user?.isVip ? [...FILTER_OPTIONS.slice(0, 4), { value: 'vip', label: 'VIP' }, FILTER_OPTIONS[4]] : FILTER_OPTIONS}
        value={filter}
        onChange={setFilter}
      />

      <div className="flex flex-col gap-3 px-4 py-4">
        {status === 'loading' && <LoadingState label="Завантажуємо події…" />}

        {status === 'error' && (
          <EmptyState
            icon={<CalendarX size={40} />}
            title="Не вдалося завантажити події."
            description={errorMessage ?? undefined}
            actionLabel="Спробувати ще раз"
            onAction={reload}
          />
        )}

        {status === 'success' && filtered.length === 0 && (
          <EmptyState
            icon={<CalendarX size={40} />}
            title="Подій не знайдено"
            description="Спробуйте інший фільтр."
          />
        )}

        {status === 'success' &&
          filtered.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </div>
  )
}
