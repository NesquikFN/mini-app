import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  Archive,
  BadgeCheck,
  CalendarDays,
  Clock,
  Crown,
  Home,
  MapPin,
  MonitorPlay,
  PartyPopper,
  Users,
} from 'lucide-react'
import type { DormEvent } from '../types/event'
import { formatEventDate, formatEventTime, isEventPast } from '../utils/date'
import { useDormitories } from '../hooks/useDormitories'
import { ParticipantAvatarStack } from './ParticipantAvatarStack'

export function EventCard({ event }: { event: DormEvent }) {
  const { getDormitoryName } = useDormitories()
  // The event list and its avatar preview are populated by separate DB reads.
  // If somebody joins between them, the preview can briefly be newer than the
  // id/count snapshot. Never render fewer participants than visible avatars.
  const participantCount = Math.max(
    event.participantCount ?? 0,
    event.participants.length,
    event.participantPreview?.length ?? 0,
  )
  const isFull = participantCount >= event.maxParticipants
  const isArchived = isEventPast(event.date, event.time)
  const dormitoryName = getDormitoryName(event.dormitoryId)

  return (
    <Link
      to={`/events/${event.id}`}
      className={`group block overflow-hidden rounded-[26px] border border-[var(--surface-border)] bg-[var(--surface-card)] shadow-[0_18px_45px_rgba(0,0,0,0.28)] transition-transform active:scale-[0.985] ${isArchived ? 'opacity-75' : ''}`}
    >
      <div
        className={`relative overflow-hidden ${event.imageUrl ? 'min-h-[320px]' : 'min-h-[250px]'}`}
        style={event.imageUrl ? { aspectRatio: '1.08' } : undefined}
      >
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={`Фото події «${event.title}»`}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-active:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,122,0,0.28),transparent_34%),linear-gradient(145deg,#24170d_0%,#111_48%,#080808_100%)]">
            <PartyPopper
              size={150}
              strokeWidth={1.1}
              className="absolute -bottom-7 -right-5 rotate-[-12deg] text-orange-500/15"
            />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/5 to-black/95" />
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-2 text-[12px] font-semibold text-white backdrop-blur-md">
            <CalendarDays size={14} className="text-orange-400" />
            {formatEventDate(event.date)}
            <span className="h-4 w-px bg-white/25" />
            <Clock size={14} className="text-orange-400" />
            {formatEventTime(event.time)}
          </span>
          {event.vipOnly && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-black/65 px-3 py-2 text-[11px] font-bold text-amber-300 backdrop-blur-md">
              <Crown size={13} /> VIP
            </span>
          )}
          {event.gpuOnly && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-black/65 px-3 py-2 text-[11px] font-bold text-blue-300 backdrop-blur-md">
              <BadgeCheck size={13} /> ГПУ
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-white drop-shadow-lg">
            {event.title}
          </h3>
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-white/75">
            {event.isOnline ? (
              <MonitorPlay size={15} className="shrink-0 text-orange-400" />
            ) : (
              <MapPin size={15} className="shrink-0 text-orange-400" />
            )}
            <span className="truncate">{event.isOnline ? 'Онлайн' : event.location}</span>
            {!event.isOnline && dormitoryName && (
              <>
                <span className="text-white/35">·</span>
                <Home size={14} className="shrink-0 text-orange-400" />
                <span className="shrink-0">{dormitoryName}</span>
              </>
            )}
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/65 py-1.5 pl-2 pr-3 text-xs font-semibold text-white/80 backdrop-blur-md">
              <ParticipantAvatarStack
                participants={event.participantPreview ?? []}
                totalCount={participantCount}
                size={30}
              />
              <span className="inline-flex shrink-0 items-center gap-1">
                <Users size={14} className="text-orange-400" />
                {participantCount}/{event.maxParticipants}
              </span>
            </span>

            {isArchived ? (
              <StatusBadge muted icon={<Archive size={13} />}>Завершено</StatusBadge>
            ) : isFull ? (
              <StatusBadge muted>Місць немає</StatusBadge>
            ) : (
              <StatusBadge>Є місця</StatusBadge>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function StatusBadge({
  children,
  icon,
  muted = false,
}: {
  children: string
  icon?: ReactNode
  muted?: boolean
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold backdrop-blur-md ${
        muted
          ? 'border-white/10 bg-black/65 text-white/55'
          : 'border-orange-400/35 bg-orange-500/20 text-orange-300'
      }`}
    >
      {icon}{children}
    </span>
  )
}
