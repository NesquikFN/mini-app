import { useState } from 'react'
import { Check, ChevronDown, Home, Loader2 } from 'lucide-react'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDormitories } from '../hooks/useDormitories'
import { useEvents } from '../hooks/useEvents'
import { updateMyDormitory, getErrorMessage } from '../services/api'

/** Гуртожиток користувача — джерело правди Supabase через
 * `users.dormitory_id` (useCurrentUser), не localStorage. Список
 * гуртожитків — з backend (useDormitories), не хардкод. Дозволяє змінити
 * вибір після онбордингу (див. DormitoryGate для першого обов'язкового
 * вибору). */
export function DormitorySelector() {
  const { user, reload } = useCurrentUser()
  const { dormitories, getDormitoryName } = useDormitories()
  const { reload: reloadEvents } = useEvents()
  const [open, setOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = user?.dormitoryId

  async function handleSelect(id: string) {
    setSavingId(id)
    setError(null)
    try {
      await updateMyDormitory(id)
      reloadEvents()
      reload()
      setOpen(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const label = selected ? getDormitoryName(selected) || 'Гуртожиток' : 'Обрати гуртожиток'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-2.5 text-[15px] font-semibold text-[var(--text-primary)] transition-transform active:scale-[0.97]"
      >
        <Home size={17} className="text-[var(--accent)]" />
        {label}
        <ChevronDown size={16} className="text-[var(--text-secondary)]" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-[dormhub-fade-in_0.15s_ease]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[560px] rounded-t-3xl border-t border-[var(--surface-border)] bg-[var(--surface-card)] pb-[max(1rem,env(safe-area-inset-bottom))] animate-[dormhub-slide-up_0.2s_ease]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Обрати гуртожиток
              </h2>
              {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            </div>
            <div className="flex flex-col gap-1 px-3 pb-3">
              {dormitories.map((dormitory) => {
                const isSelected = dormitory.id === selected
                const isSaving = savingId === dormitory.id
                return (
                  <button
                    key={dormitory.id}
                    type="button"
                    disabled={savingId !== null}
                    onClick={() => handleSelect(dormitory.id)}
                    className={`flex items-center justify-between rounded-xl px-3 py-3 text-[15px] transition-colors active:bg-[var(--surface-card-alt)] disabled:opacity-60 ${
                      isSelected
                        ? 'font-semibold text-[var(--accent)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {dormitory.name}
                    {isSaving && <Loader2 size={18} className="animate-spin text-[var(--accent)]" />}
                    {!isSaving && isSelected && <Check size={18} className="text-[var(--accent)]" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
