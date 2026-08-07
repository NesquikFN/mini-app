import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from './Button'
import type { CreateEventInput } from '../types/event'
import { todayISODate } from '../utils/date'

interface EventFormProps {
  onSubmit: (input: CreateEventInput) => Promise<void> | void
  submitting: boolean
}

interface FormErrors {
  title?: string
  date?: string
  time?: string
  location?: string
  maxParticipants?: string
}

export function EventForm({ onSubmit, submitting }: EventFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

  function validate(): FormErrors {
    const nextErrors: FormErrors = {}
    if (!title.trim()) nextErrors.title = 'Вкажіть назву події'
    if (!date) {
      nextErrors.date = 'Вкажіть дату'
    } else if (date < todayISODate()) {
      nextErrors.date = 'Дата не може бути в минулому'
    }
    if (!time) nextErrors.time = 'Вкажіть час'
    if (!location.trim()) nextErrors.location = 'Вкажіть місце'
    const maxNum = Number(maxParticipants)
    if (!maxParticipants || Number.isNaN(maxNum) || maxNum <= 0) {
      nextErrors.maxParticipants = 'Має бути більше 0'
    }
    return nextErrors
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      date,
      time,
      location: location.trim(),
      maxParticipants: Number(maxParticipants),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Назва" error={errors.title}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Наприклад, Кіновечір"
          className={inputClass(!!errors.title)}
        />
      </Field>

      <Field label="Опис">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Коротко опишіть подію"
          rows={3}
          className={inputClass(false)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата" error={errors.date}>
          <input
            type="date"
            value={date}
            min={todayISODate()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass(!!errors.date)}
          />
        </Field>
        <Field label="Час" error={errors.time}>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass(!!errors.time)}
          />
        </Field>
      </div>

      <Field label="Місце" error={errors.location}>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Наприклад, Кімната відпочинку"
          className={inputClass(!!errors.location)}
        />
      </Field>

      <Field
        label="Максимальна кількість учасників"
        error={errors.maxParticipants}
      >
        <input
          type="number"
          min={1}
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(e.target.value)}
          placeholder="Наприклад, 20"
          className={inputClass(!!errors.maxParticipants)}
        />
      </Field>

      <Button
        type="submit"
        fullWidth
        loading={submitting}
        disabled={submitting}
      >
        {submitting ? 'Створюємо…' : 'Створити подію'}
      </Button>
    </form>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-xl border bg-[var(--surface-card-alt)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-light)] ${
    hasError ? 'border-red-400' : 'border-[var(--surface-border)]'
  }`
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  )
}
