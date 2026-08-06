import type { Participant } from '../types/event'
import { Avatar } from './Avatar'

export function ParticipantList({
  participants,
}: {
  participants: Participant[]
}) {
  if (participants.length === 0) {
    return (
      <p className="text-sm text-neutral-500">Поки що ніхто не приєднався</p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {participants.map((participant) => (
        <li key={participant.id} className="flex items-center gap-3">
          <Avatar name={participant.name} />
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {participant.name}
            </p>
            {participant.username && (
              <p className="text-xs text-neutral-500">
                @{participant.username}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
