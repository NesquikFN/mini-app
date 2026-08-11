import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Users,
  UserCheck,
  CalendarDays,
  CalendarCheck,
  HandHeart,
  Home,
  MonitorPlay,
  Ticket,
  Trash2,
} from 'lucide-react'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Avatar } from '../../components/Avatar'
import { useDormitories } from '../../hooks/useDormitories'
import { formatTimeLeft } from '../../utils/date'
import {
  deleteAdminQuickPlan,
  fetchAdminQuickPlans,
  fetchAdminStats,
  getErrorMessage,
} from '../../services/api'
import type { AdminStats } from '../../types/admin'
import type { QuickPlan } from '../../types/quickPlan'

type Status = 'loading' | 'success' | 'error'

export function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchAdminStats()
      .then((data) => {
        setStats(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Огляд</h1>

      {status === 'loading' && <LoadingState label="Завантажуємо статистику…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити статистику"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Користувачі" value={stats.users} icon={<Users size={20} />} />
          <StatCard label="Зареєстровані" value={stats.registeredUsers} icon={<UserCheck size={20} />} />
          <StatCard label="Події" value={stats.events} icon={<CalendarDays size={20} />} />
          <StatCard label="Активні" value={stats.activeEvents} icon={<CalendarCheck size={20} />} />
          <StatCard label="Участі" value={stats.participants} icon={<Ticket size={20} />} />
        </div>
      )}

      <AdminQuickPlansBlock />
    </div>
  )
}

/**
 * Компактний блок «Активні швидкі плани» прямо в огляді — окремої
 * вкладки в першій версії свідомо немає: плани живуть кілька годин, тож
 * достатньо бачити останні кілька й мати змогу зняти зайве.
 */
function AdminQuickPlansBlock() {
  const { getDormitoryName } = useDormitories()
  const [plans, setPlans] = useState<QuickPlan[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<QuickPlan | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchAdminQuickPlans()
      .then((data) => {
        setPlans(data.plans)
        setTotal(data.total)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => load(), [load])

  async function handleRemove() {
    if (!pendingRemoval) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await deleteAdminQuickPlan(pendingRemoval.id)
      setPlans((current) => current.filter((item) => item.id !== pendingRemoval.id))
      setTotal((current) => Math.max(0, current - 1))
      setPendingRemoval(null)
    } catch (error) {
      setRemoveError(getErrorMessage(error))
    } finally {
      setRemoving(false)
    }
  }

  const hiddenCount = total - plans.length

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-4">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
        <HandHeart size={18} className="text-[var(--accent)]" /> Активні швидкі плани
        {total > 0 && (
          <span className="rounded-full bg-[var(--accent-soft-bg)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">
            {total}
          </span>
        )}
      </h2>

      {status === 'loading' && <LoadingState label="Завантажуємо плани…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити плани"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={load}
        />
      )}

      {status === 'success' && plans.length === 0 && (
        <EmptyState title="Активних швидких планів немає" />
      )}

      {status === 'success' && plans.length > 0 && (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex items-start gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3"
            >
              <Avatar
                name={plan.creator.nickname ?? plan.creator.firstName}
                photoUrl={plan.creator.photoUrl}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {plan.creator.nickname ?? plan.creator.firstName}
                </p>
                <p className="mt-0.5 break-words text-xs text-[var(--text-secondary)]">{plan.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-disabled)]">
                  <span className="inline-flex items-center gap-1">
                    {plan.isOnline ? <MonitorPlay size={12} /> : <Home size={12} />}
                    {plan.isOnline ? 'Онлайн' : getDormitoryName(plan.dormitoryId) ?? 'Гуртожиток'}
                  </span>
                  <span>·</span>
                  <span>Залишилось {formatTimeLeft(plan.expiresAt)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingRemoval(plan)}
                aria-label="Видалити план"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--surface-border)] text-red-400 active:bg-[var(--surface-card-alt)]"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {hiddenCount > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Ще {hiddenCount} активних планів не показано.
            </p>
          )}
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Видалити швидкий план?"
          description={removeError ?? `«${pendingRemoval.text}» буде видалено назавжди.`}
          confirmLabel="Видалити"
          loading={removing}
          onConfirm={handleRemove}
          onCancel={() => {
            setPendingRemoval(null)
            setRemoveError(null)
          }}
        />
      )}
    </section>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
        {icon}
      </span>
      <div>
        <p className="text-xl font-semibold text-[var(--text-primary)]">{value}</p>
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      </div>
    </div>
  )
}
