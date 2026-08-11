import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { EventForm } from '../components/EventForm'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useEvents } from '../hooks/useEvents'
import { fetchEventById, getErrorMessage } from '../services/api'
import type { CreateEventInput, DormEvent } from '../types/event'

export function EditEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { events, updateEvent } = useEvents()
  const { user, status: userStatus } = useCurrentUser()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fetchedEvent, setFetchedEvent] = useState<DormEvent | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)

  const contextEvent = events.find((item) => item.id === id)

  useEffect(() => {
    if (!id || contextEvent) return
    fetchEventById(id)
      .then(setFetchedEvent)
      .catch(() => setFetchFailed(true))
  }, [id, contextEvent])

  if (userStatus === 'loading' || (!contextEvent && !fetchedEvent && !fetchFailed)) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Редагувати подію" showBack />
        <LoadingState label="Завантажуємо подію…" />
      </div>
    )
  }

  const event = contextEvent ?? fetchedEvent
  if (!event) {
    return <EmptyState title="Подію не знайдено" />
  }
  if (!user || event.creatorId !== user.id) {
    return <Navigate to={`/events/${event.id}`} replace />
  }
  const editableEvent = event

  async function handleSubmit(input: CreateEventInput) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await updateEvent(editableEvent.id, input)
      navigate(`/events/${editableEvent.id}`, {
        replace: true,
        state: { successMessage: 'Подію оновлено!' },
      })
    } catch (error) {
      setSubmitError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Редагувати подію" showBack />
      <div className="px-4 py-4">
        {submitError && (
          <p className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {submitError}
          </p>
        )}
        <EventForm
          initialValues={editableEvent}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Зберегти зміни"
          submittingLabel="Зберігаємо…"
          canCreateVipOnly={Boolean(user.isVip)}
          canCreateGpuOnly={Boolean(user.isGpu)}
        />
      </div>
    </div>
  )
}
