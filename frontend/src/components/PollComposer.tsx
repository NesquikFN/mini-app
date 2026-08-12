import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from './Button'
import type { AdminPoll } from '../types/poll'

interface PollComposerInput {
  question: string
  options: string[]
  endsAt: string | null
}

interface PollComposerProps {
  /** Наявне опитування для редагування — лише чернетки; null для нового. */
  initial: AdminPoll | null
  submitting: boolean
  errorMessage?: string | null
  onSubmit: (input: PollComposerInput) => void
  onClose: () => void
}

const MAX_QUESTION = 240
const MAX_OPTION = 120
const MIN_OPTIONS = 2
const MAX_OPTIONS = 8

function toLocalInputValue(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Bottom sheet для створення й редагування опитування — той самий
 * шаблон, що й QuickPlanComposer. Редагування можливе лише поки
 * опитування ще чернетка (сервер відхилить update для опублікованого). */
export function PollComposer({
  initial,
  submitting,
  errorMessage,
  onSubmit,
  onClose,
}: PollComposerProps) {
  const [question, setQuestion] = useState(initial?.question ?? '')
  const [options, setOptions] = useState<string[]>(
    initial && initial.options.length > 0 ? initial.options.map((option) => option.text) : ['', ''],
  )
  const [endsAtLocal, setEndsAtLocal] = useState(toLocalInputValue(initial?.endsAt))
  const [touched, setTouched] = useState(false)

  const trimmedQuestion = question.trim()
  const trimmedOptions = options.map((option) => option.trim())
  const nonEmptyOptions = trimmedOptions.filter((option) => option.length > 0)
  const hasDuplicate =
    new Set(nonEmptyOptions.map((option) => option.toLowerCase())).size !== nonEmptyOptions.length
  const allFilled = nonEmptyOptions.length === options.length
  const questionValid = trimmedQuestion.length > 0 && trimmedQuestion.length <= MAX_QUESTION
  const optionsCountValid = options.length >= MIN_OPTIONS && options.length <= MAX_OPTIONS
  const isValid = questionValid && optionsCountValid && allFilled && !hasDuplicate

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((option, i) => (i === index ? value.slice(0, MAX_OPTION) : option)))
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']))
  }

  function removeOption(index: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!isValid) return
    onSubmit({
      question: trimmedQuestion,
      options: trimmedOptions,
      endsAt: endsAtLocal ? new Date(endsAtLocal).toISOString() : null,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-[dormhub-fade-in_0.15s_ease]"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-t-3xl border-t border-[var(--surface-border)] bg-[var(--surface-card)] pb-[max(1rem,env(safe-area-inset-bottom))] animate-[dormhub-slide-up_0.2s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {initial ? 'Редагувати опитування' : 'Нове опитування'}
          </h2>
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
              Запитання
              <span className={trimmedQuestion.length > MAX_QUESTION ? 'text-red-400' : 'text-[var(--text-disabled)]'}>
                {trimmedQuestion.length}/{MAX_QUESTION}
              </span>
            </span>
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value.slice(0, MAX_QUESTION))}
              onBlur={() => setTouched(true)}
              placeholder="Що організувати наступним?"
              className={`h-12 rounded-xl border bg-[var(--surface-card-alt)] px-3.5 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-light)] ${
                touched && !questionValid ? 'border-red-400' : 'border-[var(--surface-border)]'
              }`}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Варіанти (2–8)</span>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={`Варіант ${index + 1}`}
                  className="h-11 flex-1 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-light)]"
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    aria-label="Видалити варіант"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--surface-border)] text-red-400 active:bg-[var(--surface-card-alt)]"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--surface-border)] py-2.5 text-sm font-medium text-[var(--accent)]"
              >
                <Plus size={15} /> Додати варіант
              </button>
            )}
            {touched && hasDuplicate && (
              <span className="text-xs text-red-400">Варіанти не повинні повторюватись</span>
            )}
            {touched && !hasDuplicate && !allFilled && (
              <span className="text-xs text-red-400">Заповніть усі варіанти</span>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Дата завершення (необов'язково)
            </span>
            <input
              type="datetime-local"
              value={endsAtLocal}
              onChange={(event) => setEndsAtLocal(event.target.value)}
              className="h-12 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3.5 text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-light)]"
            />
          </label>

          {errorMessage && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </p>
          )}

          <Button type="submit" fullWidth loading={submitting} disabled={submitting}>
            {initial ? 'Зберегти зміни' : 'Створити'}
          </Button>
        </div>
      </form>
    </div>
  )
}
