import { Avatar } from './Avatar'
import type { PublicUser } from '../types/user'

interface ParticipantAvatarStackProps {
  /** Щонайбільше 3 профілі — сервер уже обрізає (events.service.ts),
   * але компонент теж підстраховується .slice(0, 3). */
  participants: PublicUser[]
  /** Реальна кількість учасників — може бути більшою за participants.length,
   * різниця показується кружком "+N". */
  totalCount: number
  /** 26–30px по макету; за замовчуванням 28. */
  size?: number
}

const MAX_VISIBLE = 3
const OVERLAP = 8

/** Компактний стек аватарок учасників для картки події (EventCard) —
 * навмисно незалежний від DormEvent/EventCard, щоб так само підходив
 * для Home/Events/Admin будь-де, де є превʼю учасників. */
export function ParticipantAvatarStack({ participants, totalCount, size = 28 }: ParticipantAvatarStackProps) {
  if (totalCount <= 0) return null

  const visible = participants.slice(0, MAX_VISIBLE)
  const overflow = totalCount - visible.length

  return (
    <div className="flex items-center" aria-hidden="true">
      {visible.map((user, index) => (
        <div
          key={user.id}
          className="shrink-0 rounded-full border-2 border-[var(--surface-card)]"
          style={{ marginLeft: index === 0 ? 0 : -OVERLAP, zIndex: MAX_VISIBLE - index }}
        >
          <Avatar name={user.nickname ?? user.firstName} photoUrl={user.photoUrl} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--surface-card)] bg-[var(--surface-card-alt)] font-semibold text-[var(--text-secondary)]"
          style={{ width: size, height: size, marginLeft: -OVERLAP, fontSize: size * 0.36 }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
