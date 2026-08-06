import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { FilterTabs } from '../components/FilterTabs'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/Button'
import { fetchEvents, getErrorMessage } from '../services/api'
import { formatEventDate, formatEventTime, todayISODate } from '../utils/date'
import type { DormEvent } from '../types/event'

type Status = 'loading' | 'success' | 'error'
type DateFilter = 'all' | 'today' | 'week'
type FullnessFilter = 'all' | 'available' | 'full'

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'Усі дати' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: 'Цього тижня' },
]

const FULLNESS_OPTIONS: { value: FullnessFilter; label: string }[] = [
  { value: 'all', label: 'Будь-який статус' },
  { value: 'available', label: 'Є місця' },
  { value: 'full', label: 'Заповнені' },
]

function isWithinNextDays(date: string, days: number): boolean {
  const today = new Date(todayISODate())
  const target = new Date(date)
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= days
}

export function EventsPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<DormEvent[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [fullnessFilter, setFullnessFilter] = useState<FullnessFilter>('all')

  useEffect(() => {
    fetchEvents()
      .then((data) => {
        setEvents(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  const filtered = useMemo(() => {
    return events
      .filter((event) => {
        if (dateFilter === 'today') return event.date === todayISODate()
        if (dateFilter === 'week') return isWithinNextDays(event.date, 7)
        return true
      })
      .filter((event) => {
        const isFull = event.participants.length >= event.maxParticipants
        if (fullnessFilter === 'available') return !isFull
        if (fullnessFilter === 'full') return isFull
        return true
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }, [events, dateFilter, fullnessFilter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Події</h1>
        <Link to="/events/new">
          <Button>
            <Plus size={16} /> Створити подію
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <FilterTabs options={DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} />
        <FilterTabs options={FULLNESS_OPTIONS} value={fullnessFilter} onChange={setFullnessFilter} />
      </div>

      {status === 'loading' && <LoadingState label="Завантажуємо події…" />}

      {status === 'error' && (
        <EmptyState title="Не вдалося завантажити події" description={errorMessage ?? undefined} />
      )}

      {status === 'success' && filtered.length === 0 && (
        <EmptyState title="Подій не знайдено" description="Спробуйте інші фільтри." />
      )}

      {status === 'success' && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Назва</th>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Місце</th>
                <th className="px-4 py-3 font-medium">Учасники</th>
                <th className="px-4 py-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((event) => {
                const isFull = event.participants.length >= event.maxParticipants
                return (
                  <tr
                    key={event.id}
                    className="cursor-pointer text-neutral-800 hover:bg-neutral-50"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/events/${event.id}`} className="hover:text-violet-600">
                        {event.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatEventDate(event.date)} · {formatEventTime(event.time)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{event.location}</td>
                    <td className="px-4 py-3 text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Users size={14} />
                        {event.participants.length} / {event.maxParticipants}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          isFull ? 'bg-neutral-100 text-neutral-500' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isFull ? 'Заповнено' : 'Є місця'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
