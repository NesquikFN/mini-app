import { useState, type FormEvent } from 'react'
import { Button } from './Button'
import {
  QUICK_PLAN_CATEGORIES,
  QUICK_PLAN_CATEGORY_LABELS,
  QUICK_PLAN_LIFETIMES,
  QUICK_PLAN_LIFETIME_LABELS,
  type CreateQuickPlanInput,
  type QuickPlanCategory,
  type QuickPlanLifetime,
} from '../types/quickPlan'

interface QuickPlanComposerProps {
  /** true для NO_DORMITORY_ID — такий користувач створює лише онлайн. */
  onlineOnly?: boolean
  submitting: boolean
  errorMessage?: string | null
  onSubmit: (input: CreateQuickPlanInput) => void
  onClose: () => void
}

const MIN_LENGTH = 10
const MAX_LENGTH = 180

/** Bottom sheet поверх HomePage — навмисно не окрема сторінка й не
 * маршрут: створення плану має займати секунди й не забирати контекст
 * головного екрана. Розмітка та анімації ті самі, що в ParticipantsModal. */
export function QuickPlanComposer({
  onlineOnly = false,
  submitting,
  errorMessage,
  onSubmit,
  onClose,
}: QuickPlanComposerProps) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<QuickPlanCategory>('other')
  const [isOnline, setIsOnline] = useState(onlineOnly)
  const [lifetime, setLifetime] = useState<QuickPlanLifetime>('6h')
  const [touched, setTouched] = useState(false)

  const trimmedLength = text.trim().length
  const tooShort = trimmedLength < MIN_LENGTH
  const validationMessage = touched && tooShort ? `Мінімум ${MIN_LENGTH} символів` : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (tooShort) return
    onSubmit({
      text: text.trim(),
      category,
      isOnline: onlineOnly ? true : isOnline,
      lifetime,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-[dormhub-fade-in_0.15s_ease]"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-t-3xl border-t border-[var(--surface-border)] bg-[var(--surface-card)] pb-[max(1rem,env(safe-area-inset-bottom))] animate-[dormhub-slide-up_0.2s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Що плануєш?</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[var(--accent)] active:text-[var(--accent-hover)]"
          >
            Скасувати
          </button>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-sm font-medium text-[var(--text-secondary)]">
              Коротко про план
              <span className={trimmedLength > MAX_LENGTH ? 'text-red-400' : 'text-[var(--text-disabled)]'}>
                {trimmedLength}/{MAX_LENGTH}
              </span>
            </span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
              onBlur={() => setTouched(true)}
              rows={3}
              autoFocus
              placeholder="Наприклад, йду грати у футбол о 19:00"
              className={`w-full rounded-xl border bg-[var(--surface-card-alt)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-light)] ${
                validationMessage ? 'border-red-400' : 'border-[var(--surface-border)]'
              }`}
            />
            {validationMessage && <span className="text-xs text-red-400">{validationMessage}</span>}
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Категорія</span>
            <div className="flex flex-wrap gap-2">
              {QUICK_PLAN_CATEGORIES.map((value) => (
                <Chip
                  key={value}
                  active={category === value}
                  label={QUICK_PLAN_CATEGORY_LABELS[value]}
                  onClick={() => setCategory(value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Формат</span>
            <div className="flex flex-wrap gap-2">
              <Chip
                active={!isOnline && !onlineOnly}
                disabled={onlineOnly}
                label="У гуртожитку"
                onClick={() => setIsOnline(false)}
              />
              <Chip active={isOnline || onlineOnly} label="Онлайн" onClick={() => setIsOnline(true)} />
            </div>
            {onlineOnly && (
              <span className="text-xs text-[var(--text-secondary)]">
                Без гуртожитку доступні лише онлайн-плани.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Скільки триває</span>
            <div className="flex flex-wrap gap-2">
              {QUICK_PLAN_LIFETIMES.map((value) => (
                <Chip
                  key={value}
                  active={lifetime === value}
                  label={QUICK_PLAN_LIFETIME_LABELS[value]}
                  onClick={() => setLifetime(value)}
                />
              ))}
            </div>
          </div>

          {errorMessage && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </p>
          )}

          <Button type="submit" fullWidth loading={submitting} disabled={submitting}>
            Опублікувати
          </Button>
        </div>
      </form>
    </div>
  )
}

function Chip({
  active,
  label,
  disabled = false,
  onClick,
}: {
  active: boolean
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent)]'
          : 'border-[var(--surface-border)] bg-[var(--surface-card-alt)] text-[var(--text-secondary)]'
      }`}
    >
      {label}
    </button>
  )
}
