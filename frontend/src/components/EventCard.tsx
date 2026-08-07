import { Link } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, PartyPopper, Users } from 'lucide-react'
import type { DormEvent } from '../types/event'
import { formatEventDate, formatEventTime } from '../utils/date'
import { useDormitories } from '../hooks/useDormitories'

export function EventCard({ event }: { event: DormEvent }) {
  const { getDormitoryName } = useDormitories()
  const isFull = event.participants.length >= event.maxParticipants
  const dormitoryName = getDormitoryName(event.dormitoryId)

  return (
    <Link
      to={`/events/${event.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 transition-transform active:scale-[0.98] active:bg-[var(--surface-card-alt)]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
          <PartyPopper size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {event.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={14} /> {formatEventDate(event.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={14} /> {formatEventTime(event.time)}
            </span>
          </div>
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            <MapPin size={14} /> {event.location}
          </span>
          {dormitoryName && (
            <span className="mt-1 block text-xs text-[var(--text-secondary)]">
              🏠 {dormitoryName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
          <Users size={14} />
          {event.participants.length} / {event.maxParticipants} учасників
        </span>
        {isFull ? (
          <span className="rounded-full bg-[var(--surface-card-alt)] px-3 py-1 text-xs font-medium text-[var(--text-disabled)]">
            Місць немає
          </span>
        ) : (
          <span className="rounded-full bg-[var(--accent-soft-bg)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            Є місця
          </span>
        )}
      </div>
    </Link>
  )
}
