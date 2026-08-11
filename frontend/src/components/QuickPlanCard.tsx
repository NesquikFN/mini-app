import { Link } from 'react-router-dom'
import { Clock, Home, MonitorPlay, Trash2, Users } from 'lucide-react'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { ParticipantAvatarStack } from './ParticipantAvatarStack'
import { useDormitories } from '../hooks/useDormitories'
import { formatTimeLeft } from '../utils/date'
import { QUICK_PLAN_CATEGORY_LABELS, type QuickPlan } from '../types/quickPlan'

interface QuickPlanCardProps {
  plan: QuickPlan
  currentUserId?: string
  canModerate?: boolean
  pending?: boolean
  onJoin: (planId: string) => void
  onLeave: (planId: string) => void
  onDelete: (plan: QuickPlan) => void
  onShowParticipants: (plan: QuickPlan) => void
}

export function QuickPlanCard({
  plan,
  currentUserId,
  canModerate = false,
  pending = false,
  onJoin,
  onLeave,
  onDelete,
  onShowParticipants,
}: QuickPlanCardProps) {
  const { getDormitoryName } = useDormitories()
  const isAuthor = plan.creatorId === currentUserId
  const authorName = plan.creator.nickname ?? plan.creator.firstName
  const dormitoryName = getDormitoryName(plan.dormitoryId)

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <div className="flex items-start gap-3">
        <Link to={`/users/${plan.creatorId}`} className="shrink-0" aria-label={`Профіль ${authorName}`}>
          <Avatar name={authorName} photoUrl={plan.creator.photoUrl} size={42} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to={`/users/${plan.creatorId}`}
              className="truncate text-sm font-semibold text-[var(--text-primary)]"
            >
              {authorName}
            </Link>
            <span className="shrink-0 rounded-full bg-[var(--accent-soft-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
              {QUICK_PLAN_CATEGORY_LABELS[plan.category]}
            </span>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1">
              {plan.isOnline ? <MonitorPlay size={13} /> : <Home size={13} />}
              {plan.isOnline ? 'Онлайн' : dormitoryName ?? 'Гуртожиток'}
            </span>
            <span className="text-[var(--text-disabled)]">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> {formatTimeLeft(plan.expiresAt)}
            </span>
          </p>
        </div>

        {(isAuthor || canModerate) && (
          <button
            type="button"
            onClick={() => onDelete(plan)}
            aria-label="Видалити план"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--surface-border)] text-red-400 active:bg-[var(--surface-card-alt)]"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Текст плану пишуть користувачі: рендериться як звичайний
          текстовий вузол React (без dangerouslySetInnerHTML), тож ні HTML,
          ні посилання з нього не стають активними. */}
      <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-[var(--text-primary)]">
        {plan.text}
      </p>

      <div className="flex items-center justify-between gap-3">
        {plan.participantCount > 0 ? (
          <button
            type="button"
            onClick={() => onShowParticipants(plan)}
            className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface-card-alt)] py-1 pl-1.5 pr-3 text-xs font-semibold text-[var(--text-secondary)]"
          >
            <ParticipantAvatarStack
              participants={plan.participants}
              totalCount={plan.participantCount}
              size={24}
            />
            <span className="inline-flex shrink-0 items-center gap-1">
              <Users size={13} className="text-[var(--accent)]" />
              {plan.participantCount}
            </span>
          </button>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">Ще ніхто не відгукнувся</span>
        )}

        {!isAuthor && (
          <Button
            variant={plan.joined ? 'outline' : 'primary'}
            className="!h-10 !shrink-0 !rounded-xl !px-4 !text-sm"
            loading={pending}
            disabled={pending}
            onClick={() => (plan.joined ? onLeave(plan.id) : onJoin(plan.id))}
          >
            {plan.joined ? 'Не піду' : 'Я з вами'}
          </Button>
        )}
      </div>
    </div>
  )
}
