import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EventForm } from '../components/EventForm'
import { createEvent, getErrorMessage } from '../services/api'
import type { EventInput } from '../types/event'

export function CreateEventPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(input: EventInput) {
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const event = await createEvent(input)
      navigate(`/events/${event.id}`)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900">Створити подію</h1>
      {errorMessage && (
        <p className="max-w-xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </p>
      )}
      <EventForm
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Створити подію"
        submittingLabel="Створюємо…"
      />
    </div>
  )
}
