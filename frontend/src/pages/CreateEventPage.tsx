import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Gamepad2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EventForm } from '../components/EventForm'
import { useEvents } from '../hooks/useEvents'
import { getErrorMessage } from '../services/api'
import type { CreateEventInput } from '../types/event'

export function CreateEventPage() {
  const { createEvent } = useEvents()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(input: CreateEventInput) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await createEvent(input)
      navigate('/events', {
        state: { successMessage: 'Подію успішно створено!' },
      })
    } catch (error) {
      setSubmitError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Створити подію" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Link
          to="/templates"
          className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
            <Gamepad2 size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--text-primary)]">Швидкий старт за шаблоном</p>
            <p className="text-xs text-[var(--text-secondary)]">Обрати готову гру у вкладці «Ігри»</p>
          </div>
        </Link>

        {submitError && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {submitError}
          </p>
        )}
        <EventForm onSubmit={handleSubmit} submitting={submitting} />
      </div>
    </div>
  )
}
