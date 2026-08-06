import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { PageHeader } from '../components/PageHeader'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { FilterTabs } from '../components/FilterTabs'
import { isSameDay, isWithinNextDays } from '../utils/date'

type FilterValue = 'all' | 'today' | 'week'

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Усі' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: 'Цього тижня' },
]

export function EventsPage() {
  const { events, status, errorMessage, reload } = useEvents()
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

  const filtered = events
    .filter((event) => {
      if (filter === 'today') return isSameDay(event.date, new Date())
      if (filter === 'week') return isWithinNextDays(event.date, 7)
      return true
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  return (
    <div className="flex flex-col">
      <PageHeader title="Події" />

      {successMessage && (
        <div className="mx-4 mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      )}

      <FilterTabs
        options={FILTER_OPTIONS}
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
