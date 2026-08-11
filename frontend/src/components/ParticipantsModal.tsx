import type { PublicUser } from '../types/user'
import { ParticipantProfileRow } from './ParticipantProfileRow'

interface ParticipantsModalProps {
  participants: PublicUser[]
  onClose: () => void
  removable?: boolean
  creatorId?: string
  pendingUserId?: string | null
  onRemove?: (user: PublicUser) => void
}

export function ParticipantsModal({
  participants,
  onClose,
  removable = false,
  creatorId,
  pendingUserId,
  onRemove,
}: ParticipantsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-[dormhub-fade-in_0.15s_ease]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-t-3xl border-t border-[var(--surface-border)] bg-[var(--surface-card)] pb-[env(safe-area-inset-bottom)] animate-[dormhub-slide-up_0.2s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Учасники · {participants.length}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[var(--accent)] active:text-[var(--accent-hover)]"
          >
            Сховати
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-2.5">
            {participants.map((participant) => (
              <ParticipantProfileRow
                key={participant.id}
                participant={participant}
                organizer={participant.id === creatorId}
                removable={removable && participant.id !== creatorId}
                removing={pendingUserId === participant.id}
                removeDisabled={pendingUserId !== null && pendingUserId !== participant.id}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
