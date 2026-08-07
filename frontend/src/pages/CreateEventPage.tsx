import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
      <div className="px-4 py-4">
        {submitError && (
          <p className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {submitError}
          </p>
        )}
        <EventForm onSubmit={handleSubmit} submitting={submitting} />
      </div>
    </div>
  )
}
