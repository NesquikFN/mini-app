import { BadgeCheck, Crown, ShieldCheck, Sparkles } from 'lucide-react'
import { ReliableOrganizerBadge } from './ReliableOrganizerBadge'

interface RoleBadgesProps {
  isAdmin?: boolean
  isHost?: boolean
  isVip?: boolean
  isGpu?: boolean
  isReliableOrganizer?: boolean
  centered?: boolean
}

export function RoleBadges({
  isAdmin,
  isHost,
  isVip,
  isGpu,
  isReliableOrganizer,
  centered = false,
}: RoleBadgesProps) {
  if (!isAdmin && !isHost && !isVip && !isGpu && !isReliableOrganizer) return null

  return (
    <div className={`flex flex-wrap gap-1.5 ${centered ? 'justify-center' : ''}`}>
      {isAdmin && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft-bg)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">
          <ShieldCheck size={13} /> Адмін
        </span>
      )}
      {isHost && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-1 text-xs font-semibold text-violet-400">
          <Sparkles size={13} /> Хост
        </span>
      )}
      {isVip && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-400">
          <Crown size={13} /> VIP
        </span>
      )}
      {isGpu && (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-1 text-xs font-semibold text-blue-400">
          <BadgeCheck size={13} /> ГПУ
        </span>
      )}
      {isReliableOrganizer && <ReliableOrganizerBadge />}
    </div>
  )
}
