import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from './Button'
import type { EventInput } from '../types/event'
import { todayISODate } from '../utils/date'

interface EventFormProps {
  initialValues?: EventInput
  onSubmit: (input: EventInput) => Promise<void> | void
  submitting: boolean
  submitLabel: string
  submittingLabel: string
}

interface FormErrors {
  title?: string
  date?: string
  time?: string
  location?: string
  maxParticipants?: string
}

export function EventForm({
  initialValues,
  onSubmit,
  submitting,
  submitLabel,
  submittingLabel,
}: EventFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [date, setDate] = useState(initialValues?.date ?? '')
  const [time, setTime] = useState(initialValues?.time ?? '')
  const [location, setLocation] = useState(initialValues?.location ?? '')
  const [maxParticipants, setMaxParticipants] = useState(
    initialValues ? String(initialValues.maxParticipants) : '',
  )
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
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
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

      <Field label="Максимальна кількість учасників" error={errors.maxParticipants}>
        <input
          type="number"
          min={1}
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(e.target.value)}
          placeholder="Наприклад, 20"
          className={inputClass(!!errors.maxParticipants)}
        />
      </Field>

      <Button type="submit" loading={submitting} disabled={submitting} className="self-start">
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-500 ${
    hasError ? 'border-red-400' : 'border-neutral-300'
  }`
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  )
}
