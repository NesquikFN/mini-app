import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Archive, CalendarDays, CalendarX, Crown, Home, MonitorPlay, Sparkles } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { PageHeader } from '../components/PageHeader'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { isEventPast, isSameDay, isWithinNextDays } from '../utils/date'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { NO_DORMITORY_ID } from '../types/dormitory'

type DateFilter = 'upcoming' | 'today' | 'week' | 'archive'
type KindFilter = 'all' | 'offline' | 'online' | 'vip'

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'upcoming', label: 'Найближчі' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: 'Цього тижня' },
  { value: 'archive', label: 'Архів' },
]

const KIND_OPTIONS: { value: KindFilter; label: string; icon: ReactNode }[] = [
  { value: 'all', label: 'Усі', icon: <Sparkles size={25} /> },
  { value: 'offline', label: 'Офлайн', icon: <Home size={25} /> },
  { value: 'online', label: 'Онлайн', icon: <MonitorPlay size={25} /> },
  { value: 'vip', label: 'VIP', icon: <Crown size={25} /> },
]

export function EventsPage() {
  const { events, status, errorMessage, reload, scope, setScope } = useEvents()
  const { user } = useCurrentUser()
  const [dateFilter, setDateFilter] = useState<DateFilter>('upcoming')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const location = useLocation()
  const navigate = useNavigate()
  const successMessage = (location.state as { successMessage?: string } | null)
    ?.successMessage
  const onlineOnly = user?.dormitoryId === NO_DORMITORY_ID

  useEffect(() => {
    if (!successMessage) return
    const timer = setTimeout(() => {
      navigate(location.pathname, { replace: true, state: {} })
    }, 3000)
    return () => clearTimeout(timer)
  }, [successMessage, navigate, location.pathname])

  const effectiveKindFilter = onlineOnly && kindFilter === 'offline' ? 'all' : kindFilter

  const filtered = events
    .filter((event) => {
      const archived = isEventPast(event.date, event.time)
      if (dateFilter === 'archive') {
        if (!archived) return false
      } else {
        if (archived) return false
        if (dateFilter === 'today' && !isSameDay(event.date, new Date())) return false
        if (dateFilter === 'week' && !isWithinNextDays(event.date, 7)) return false
      }

      if (effectiveKindFilter === 'offline') return !event.isOnline
      if (effectiveKindFilter === 'online') return event.isOnline
      if (effectiveKindFilter === 'vip') return event.vipOnly
      return true
    })
    .sort((a, b) =>
      dateFilter === 'archive'
        ? (b.date + b.time).localeCompare(a.date + a.time)
        : (a.date + a.time).localeCompare(b.date + b.time),
    )

  const availableKinds = KIND_OPTIONS.filter((option) => {
    if (onlineOnly && option.value === 'offline') return false
    if (!user?.isVip && option.value === 'vip') return false
    return true
  })

  return (
    <div className="flex flex-col">
      <PageHeader title="Події" />

      {successMessage && (
        <div className="mx-4 mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
          {successMessage}
        </div>
      )}

      <div className="border-b border-[var(--surface-border)] bg-[var(--surface-bg)] pt-3">
        {!onlineOnly && (
          <div className="mx-4 mb-3 inline-flex rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-1">
            <ScopeButton active={scope === 'mine'} onClick={() => setScope('mine')}>
              Мій гуртожиток
            </ScopeButton>
            <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
              Усі
            </ScopeButton>
          </div>
        )}

        <div className="flex gap-6 overflow-x-auto px-4">
          {DATE_OPTIONS.map((option) => {
            const active = dateFilter === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setDateFilter(option.value)}
                className={`relative shrink-0 pb-3 text-sm font-semibold transition-colors ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
              >
                {option.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />}
              </button>
            )
          })}
        </div>

        <div className="flex gap-5 overflow-x-auto px-4 py-4">
          {availableKinds.map((option) => {
            const active = effectiveKindFilter === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKindFilter(option.value)}
                className={`flex shrink-0 flex-col items-center gap-2 text-xs font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
              >
                <span className={`flex h-16 w-16 items-center justify-center rounded-full border bg-[var(--surface-card)] transition-all ${active ? 'border-[var(--accent)] text-[var(--accent)] shadow-[0_0_18px_rgba(255,122,0,0.3)]' : 'border-[var(--surface-border)] text-[var(--text-secondary)]'}`}>
                  {option.icon}
                </span>
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4">
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
            icon={dateFilter === 'archive' ? <Archive size={40} /> : <CalendarDays size={40} />}
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

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-[var(--accent-soft-bg)] text-[var(--accent)]'
          : 'text-[var(--text-secondary)]'
      }`}
    >
      {children}
    </button>
  )
}
