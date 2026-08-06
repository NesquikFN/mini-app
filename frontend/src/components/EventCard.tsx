import { Link } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, PartyPopper, Users } from 'lucide-react'
import type { DormEvent } from '../types/event'
import { formatEventDate, formatEventTime } from '../utils/date'

export function EventCard({ event }: { event: DormEvent }) {
  const isFull = event.participants.length >= event.maxParticipants

  return (
    <Link
      to={`/events/${event.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 active:bg-neutral-50"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <PartyPopper size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-neutral-900">
            {event.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={14} /> {formatEventDate(event.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={14} /> {formatEventTime(event.time)}
            </span>
          </div>
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-neutral-500">
            <MapPin size={14} /> {event.location}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
          <Users size={14} />
          {event.participants.length} / {event.maxParticipants} учасників
        </span>
        {isFull ? (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
            Місць немає
          </span>
        ) : (
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-600">
            Є місця
          </span>
        )}
      </div>
    </Link>
  )
}
