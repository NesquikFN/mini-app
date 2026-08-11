import { ChevronRight, Crown, UserX } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicUser } from '../types/user'
import { Avatar } from './Avatar'
import { Button } from './Button'

interface ParticipantProfileRowProps {
  participant: PublicUser
  organizer?: boolean
  removable?: boolean
  removing?: boolean
  removeDisabled?: boolean
  onRemove?: (participant: PublicUser) => void
}

export function ParticipantProfileRow({
  participant,
  organizer = false,
  removable = false,
  removing = false,
  removeDisabled = false,
  onRemove,
}: ParticipantProfileRowProps) {
  const displayName = participant.nickname ?? participant.firstName
  const secondaryText = participant.username
    ? `@${participant.username}`
    : participant.nickname && participant.nickname !== participant.firstName
      ? participant.firstName
      : 'Переглянути профіль'

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] p-2.5">
      <Link
        to={`/users/${participant.id}`}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <div className="rounded-full ring-2 ring-[var(--surface-border)] ring-offset-2 ring-offset-[var(--surface-card-alt)]">
          <Avatar name={displayName} photoUrl={participant.photoUrl} size={46} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {displayName}
            </p>
            {organizer && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                <Crown size={11} /> Організатор
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
            {secondaryText}
          </p>
        </div>

        <ChevronRight
          size={19}
          className="shrink-0 text-[var(--text-disabled)] transition-transform group-active:translate-x-0.5"
        />
      </Link>

      {removable && onRemove && (
        <Button
          variant="outline"
          className="!h-11 !w-11 !shrink-0 !rounded-xl !px-0 text-red-400"
          loading={removing}
          disabled={removeDisabled}
          aria-label={`Видалити ${displayName} з учасників`}
          onClick={() => onRemove(participant)}
        >
          {!removing && <UserX size={17} />}
        </Button>
      )}
    </div>
  )
}
