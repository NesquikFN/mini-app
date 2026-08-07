import { useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Check, Home, Loader2 } from 'lucide-react'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDormitories } from '../hooks/useDormitories'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { updateMyDormitory, getErrorMessage } from '../services/api'

/**
 * Онбординг-гейт основного застосунку — аналог AdminGuard, але блокує не
 * за правами доступу, а поки в користувача не обрано users.dormitory_id.
 * Джерело правди — Supabase через GET/PATCH /me (useCurrentUser), не
 * localStorage: після reload сторінки вибір лишається, бо приходить із
 * backend разом з рештою профілю. Список гуртожитків — з backend
 * (useDormitories), не хардкод.
 */
export function DormitoryGate() {
  const { user, status, errorMessage, reload } = useCurrentUser()
  const {
    dormitories,
    status: dormitoriesStatus,
    errorMessage: dormitoriesError,
    reload: reloadDormitories,
  } = useDormitories()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (status === 'loading' || dormitoriesStatus === 'loading') {
    return (
      <FullScreenCenter>
        <LoadingState label="Завантажуємо профіль…" />
      </FullScreenCenter>
    )
  }

  if (status === 'error' || !user) {
    return (
      <FullScreenCenter>
        <EmptyState
          title="Не вдалося завантажити профіль"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={reload}
        />
      </FullScreenCenter>
    )
  }

  if (dormitoriesStatus === 'error') {
    return (
      <FullScreenCenter>
        <EmptyState
          title="Не вдалося завантажити список гуртожитків"
          description={dormitoriesError ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={reloadDormitories}
        />
      </FullScreenCenter>
    )
  }

  if (!user.dormitoryId) {
    const handleSelect = async (id: string) => {
      setSavingId(id)
      setSaveError(null)
      try {
        await updateMyDormitory(id)
        reload()
      } catch (error) {
        setSaveError(getErrorMessage(error))
        setSavingId(null)
      }
    }

    return (
      <div className="theme-dorm flex min-h-screen w-full flex-col items-center bg-[var(--surface-bg)] px-6 py-12">
        <div className="flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
              <Home size={26} />
            </span>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              Обери свій гуртожиток
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Це допоможе бачити події твого гуртожитку.
            </p>
          </div>

          {saveError && <p className="text-center text-sm text-red-400">{saveError}</p>}

          <div className="flex flex-col gap-2">
            {dormitories.map((dormitory) => {
              const isSaving = savingId === dormitory.id
              return (
                <button
                  key={dormitory.id}
                  type="button"
                  disabled={savingId !== null}
                  onClick={() => handleSelect(dormitory.id)}
                  className="flex items-center justify-between rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3.5 text-[15px] font-medium text-[var(--text-primary)] transition-transform active:scale-[0.98] active:bg-[var(--surface-card-alt)] disabled:opacity-60"
                >
                  {dormitory.name}
                  {isSaving && (
                    <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
                  )}
                  {!isSaving && <Check size={18} className="text-transparent" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}

function FullScreenCenter({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dorm mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center bg-[var(--surface-bg)] px-4">
      {children}
    </div>
  )
}
