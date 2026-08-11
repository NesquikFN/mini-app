import { useState } from 'react'
import { ChevronDown, ChevronUp, HandHeart, Plus } from 'lucide-react'
import { QuickPlanCard } from './QuickPlanCard'
import { QuickPlanComposer } from './QuickPlanComposer'
import { ParticipantsModal } from './ParticipantsModal'
import { ConfirmDialog } from './ConfirmDialog'
import { LoadingState } from './LoadingState'
import { EmptyState } from './EmptyState'
import { useQuickPlans } from '../hooks/useQuickPlans'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { getErrorMessage } from '../services/api'
import { NO_DORMITORY_ID } from '../types/dormitory'
import type { CreateQuickPlanInput, QuickPlan } from '../types/quickPlan'

/** Скільки планів видно до натискання «Показати ще». */
const COLLAPSED_COUNT = 3

/**
 * Блок «Хто зі мною?» на головній. Свідомо не окрема сторінка й не пункт
 * навігації: увесь цикл (створити → відгукнутись → видалити) живе прямо
 * тут, а «Показати ще» лише розгортає решту списку на місці.
 */
export function QuickPlansSection() {
  const { user } = useCurrentUser()
  const {
    plans,
    status,
    errorMessage,
    pendingPlanId,
    reload,
    createPlan,
    deletePlan,
    joinPlan,
    leavePlan,
  } = useQuickPlans()

  const [expanded, setExpanded] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [participantsOf, setParticipantsOf] = useState<QuickPlan | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<QuickPlan | null>(null)
  const [deleting, setDeleting] = useState(false)

  const visiblePlans = expanded ? plans : plans.slice(0, COLLAPSED_COUNT)
  const hiddenCount = plans.length - COLLAPSED_COUNT

  async function handleCreate(input: CreateQuickPlanInput) {
    setSubmitting(true)
    setComposerError(null)
    try {
      await createPlan(input)
      setComposerOpen(false)
    } catch (error) {
      setComposerError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoin(planId: string) {
    setActionError(null)
    try {
      await joinPlan(planId)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleLeave(planId: string) {
    setActionError(null)
    try {
      await leavePlan(planId)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleDelete() {
    if (!pendingDeletion) return
    setDeleting(true)
    setActionError(null)
    try {
      await deletePlan(pendingDeletion.id)
      setPendingDeletion(null)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
          <HandHeart size={18} className="text-[var(--accent)]" /> Хто зі мною?
        </h2>
        <button
          type="button"
          onClick={() => {
            setComposerError(null)
            setComposerOpen(true)
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)] active:scale-[0.97]"
        >
          <Plus size={16} /> Що плануєш?
        </button>
      </div>

      {status === 'loading' && <LoadingState label="Завантажуємо плани…" />}

      {status === 'error' && (
        <EmptyState
          icon={<HandHeart size={36} />}
          title="Не вдалося завантажити плани"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={reload}
        />
      )}

      {status === 'success' && plans.length === 0 && (
        <EmptyState
          icon={<HandHeart size={36} />}
          title="Поки що планів немає"
          description="Запропонуйте щось спонтанне — це займе 10 секунд."
        />
      )}

      {status === 'success' && plans.length > 0 && (
        <div className="flex flex-col gap-3">
          {visiblePlans.map((plan) => (
            <QuickPlanCard
              key={plan.id}
              plan={plan}
              currentUserId={user?.id}
              canModerate={Boolean(user?.isAdmin)}
              pending={pendingPlanId === plan.id}
              onJoin={handleJoin}
              onLeave={handleLeave}
              onDelete={setPendingDeletion}
              onShowParticipants={setParticipantsOf}
            />
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] py-3 text-sm font-semibold text-[var(--accent)] active:bg-[var(--surface-card-alt)]"
            >
              {expanded ? (
                <>
                  <ChevronUp size={16} /> Згорнути
                </>
              ) : (
                <>
                  <ChevronDown size={16} /> Показати ще {hiddenCount}
                </>
              )}
            </button>
          )}
        </div>
      )}

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      {composerOpen && (
        <QuickPlanComposer
          onlineOnly={user?.dormitoryId === NO_DORMITORY_ID}
          submitting={submitting}
          errorMessage={composerError}
          onSubmit={handleCreate}
          onClose={() => setComposerOpen(false)}
        />
      )}

      {participantsOf && (
        <ParticipantsModal
          participants={participantsOf.participants}
          onClose={() => setParticipantsOf(null)}
        />
      )}

      {pendingDeletion && (
        <ConfirmDialog
          title="Видалити план?"
          description={
            actionError ?? `«${pendingDeletion.text}» зникне разом зі списком тих, хто відгукнувся.`
          }
          confirmLabel="Видалити"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => {
            setPendingDeletion(null)
            setActionError(null)
          }}
        />
      )}
    </section>
  )
}
