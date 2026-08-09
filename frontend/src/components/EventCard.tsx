import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Archive, CalendarDays, Clock, Home, MapPin, MonitorPlay, PartyPopper, Users } from 'lucide-react'
import type { DormEvent } from '../types/event'
import { formatEventDate, formatEventTime, isEventPast } from '../utils/date'
import { useDormitories } from '../hooks/useDormitories'
import { ParticipantAvatarStack } from './ParticipantAvatarStack'

export function EventCard({ event }: { event: DormEvent }) {
  const { getDormitoryName } = useDormitories()
  const isFull = event.participants.length >= event.maxParticipants
  const dormitoryName = getDormitoryName(event.dormitoryId)
  const dormitoryNumber = dormitoryName?.match(/№?\s*(\d+)/)?.[1]
  const isArchived = isEventPast(event.date, event.time)

  return (
    <Link
      to={`/events/${event.id}`}
      className={`flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 transition-transform active:scale-[0.98] active:bg-[var(--surface-card-alt)] ${isArchived ? 'opacity-75' : ''}`}
    >
      {event.imageUrl && (
        <div className="relative overflow-hidden rounded-xl">
          <img
            src={event.imageUrl}
            alt=""
            className="h-48 w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-x-0 top-0 flex flex-nowrap items-center gap-1 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2 pb-9 pt-2">
            <CardMetaBadge icon={<CalendarDays size={13} />}>
              {formatEventDate(event.date)}
            </CardMetaBadge>
            <CardMetaBadge icon={<Clock size={13} />}>
              {formatEventTime(event.time)}
            </CardMetaBadge>
            <CardMetaBadge
              icon={event.isOnline ? <MonitorPlay size={13} /> : <MapPin size={13} />}
              flexible
            >
              {event.isOnline ? 'Онлайн' : event.location}
            </CardMetaBadge>
            {!event.isOnline && dormitoryNumber && (
              <CardMetaBadge icon={<Home size={13} />}>
                №{dormitoryNumber}
              </CardMetaBadge>
            )}
          </div>
        </div>
      )}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
          <PartyPopper size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {event.title}
          </h3>
          {!event.imageUrl && (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={14} /> {formatEventDate(event.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={14} /> {formatEventTime(event.time)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                  {event.isOnline ? <MonitorPlay size={14} /> : <MapPin size={14} />}
                  {event.isOnline ? 'Онлайн' : event.location}
                </span>
                {!event.isOnline && dormitoryName && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Home size={13} /> {dormitoryName}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
          <ParticipantAvatarStack
            participants={event.participantPreview ?? []}
            totalCount={event.participantCount ?? event.participants.length}
          />
          <span className="inline-flex shrink-0 items-center gap-1">
            <Users size={14} />
            {event.participants.length} / {event.maxParticipants} учасників
          </span>
        </span>
        {isArchived ? (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--surface-card-alt)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
            <Archive size={12} /> Завершено
          </span>
        ) : isFull ? (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--surface-card-alt)] px-3 py-1 text-xs font-medium text-[var(--text-disabled)]">
            Місць немає
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--accent-soft-bg)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            Є місця
          </span>
        )}
      </div>
    </Link>
  )
}

function CardMetaBadge({
  icon,
  children,
  flexible = false,
}: {
  icon: ReactNode
  children: ReactNode
  flexible?: boolean
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm ${
        flexible ? 'max-w-[40%] shrink' : 'shrink-0'
      }`}
    >
      <span className="shrink-0 text-orange-400">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  )
}
