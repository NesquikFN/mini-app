import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, Trash2, User, Users } from 'lucide-react'
import { SearchInput } from '../../components/SearchInput'
import { FilterTabs } from '../../components/FilterTabs'
import { PaginationControls } from '../../components/PaginationControls'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatEventDate, formatEventTime } from '../../utils/date'
import { deleteAdminEvent, fetchAdminEvents, getErrorMessage } from '../../services/api'
import type { AdminEventDateFilter, AdminEventsResponse } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'
const LIMIT = 20
const SEARCH_DEBOUNCE_MS = 300

const DATE_OPTIONS: { value: AdminEventDateFilter; label: string }[] = [
  { value: 'all', label: 'Усі дати' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: 'Цього тижня' },
]

export function AdminEventsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<AdminEventDateFilter>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminEventsResponse | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [eventPendingDelete, setEventPendingDelete] = useState<{ id: string; title: string } | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const runFetch = useCallback(() => {
    fetchAdminEvents(page, LIMIT, debouncedSearch || undefined, dateFilter)
      .then((res) => {
        setData(res)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [page, debouncedSearch, dateFilter])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const load = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  useEffect(() => {
    if (!successMessage) return
    const timer = setTimeout(() => setSuccessMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [successMessage])

  async function handleConfirmDelete() {
    if (!eventPendingDelete) return
    setDeleting(true)
    try {
      await deleteAdminEvent(eventPendingDelete.id)
      setData((prev) =>
        prev
          ? {
              ...prev,
              events: prev.events.filter((event) => event.id !== eventPendingDelete.id),
              pagination: { ...prev.pagination, total: Math.max(0, prev.pagination.total - 1) },
            }
          : prev,
      )
      setSuccessMessage(`Подію «${eventPendingDelete.title}» видалено.`)
      setEventPendingDelete(null)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-neutral-900">Події</h1>
      <SearchInput value={search} onChange={setSearch} placeholder="Назва події" />
      <FilterTabs options={DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} />

      {successMessage && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      )}

      {status === 'loading' && <LoadingState label="Завантажуємо події…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити події"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={load}
        />
      )}

      {status === 'success' && data && data.events.length === 0 && (
        <EmptyState title="Подій не знайдено" description="Спробуйте інші фільтри." />
      )}

      {status === 'success' && data && data.events.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {data.events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <p className="text-base font-semibold text-neutral-900">{event.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={14} /> {formatEventDate(event.date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} /> {formatEventTime(event.time)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} /> {event.location}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <User size={14} /> {event.creator.firstName}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} /> {event.participantsCount}/{event.maxParticipants}
                  </span>
                </div>
                <div className="mt-1 flex gap-2">
                  <Link to={`/admin/events/${event.id}`} className="flex-1">
                    <Button variant="outline" fullWidth>
                      Переглянути
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    onClick={() => setEventPendingDelete({ id: event.id, title: event.title })}
                  >
                    <Trash2 size={16} /> Видалити
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <PaginationControls pagination={data.pagination} onPageChange={setPage} />
        </>
      )}

      {eventPendingDelete && (
        <ConfirmDialog
          title="Видалити подію?"
          description={`«${eventPendingDelete.title}» — цю дію неможливо скасувати.`}
          confirmLabel="Видалити"
          loading={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setEventPendingDelete(null)}
        />
      )}
    </div>
  )
}
