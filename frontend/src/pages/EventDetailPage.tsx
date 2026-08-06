import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, PartyPopper, Users } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { formatEventDate, formatEventTime } from '../utils/date'
import { getErrorMessage } from '../services/api'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const {
    events,
    status: eventsStatus,
    errorMessage: eventsError,
    reload: reloadEvents,
    joinEvent,
    leaveEvent,
    pendingEventId,
  } = useEvents()
  const {
    user,
    status: userStatus,
    errorMessage: userError,
    reload: reloadUser,
  } = useCurrentUser()
  const [actionError, setActionError] = useState<string | null>(null)

  if (eventsStatus === 'loading' || userStatus === 'loading') {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <LoadingState label="Завантажуємо подію…" />
      </div>
    )
  }

  if (eventsStatus === 'error') {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <EmptyState
          title="Не вдалося завантажити подію"
          description={eventsError ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={reloadEvents}
        />
      </div>
    )
  }

  if (userStatus === 'error' || !user) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <EmptyState
          title="Не вдалося завантажити профіль"
          description={userError ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={reloadUser}
        />
      </div>
    )
  }

  const event = events.find((item) => item.id === id)

  if (!event) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <EmptyState
          title="Подію не знайдено"
          description="Можливо, її вже видалили."
        />
      </div>
    )
  }

  const isJoined = event.participants.includes(user.id)
  const isFull = event.participants.length >= event.maxParticipants
  const isPending = pendingEventId === event.id
  const eventId = event.id

  const handleToggleParticipation = async () => {
    setActionError(null)
    try {
      if (isJoined) {
        await leaveEvent(eventId)
      } else {
        await joinEvent(eventId)
      }
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title={event.title} showBack />

      <div className="flex flex-col gap-5 px-4 py-4 pb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <PartyPopper size={24} />
          </span>
          <h1 className="text-xl font-semibold text-neutral-900">
            {event.title}
          </h1>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={16} className="text-neutral-400" />{' '}
            {formatEventDate(event.date)}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock size={16} className="text-neutral-400" />{' '}
            {formatEventTime(event.time)}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin size={16} className="text-neutral-400" /> {event.location}
          </span>
        </div>

        {event.description && (
          <section>
            <h2 className="mb-1 text-sm font-semibold text-neutral-900">
              Опис
            </h2>
            <p className="text-sm leading-relaxed text-neutral-600">
              {event.description}
            </p>
          </section>
        )}

        <section className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Учасники</h2>
          <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
            <Users size={14} /> {event.participants.length} /{' '}
            {event.maxParticipants}
          </span>
        </section>

        {actionError && <p className="text-sm text-red-500">{actionError}</p>}

        {isFull && !isJoined ? (
          <Button variant="secondary" fullWidth disabled>
            Місць більше немає
          </Button>
        ) : (
          <Button
            variant={isJoined ? 'outline' : 'primary'}
            fullWidth
            loading={isPending}
            disabled={isPending}
            onClick={handleToggleParticipation}
          >
            {isPending
              ? isJoined
                ? 'Скасовую…'
                : 'Приєднуюсь…'
              : isJoined
                ? 'Скасувати участь'
                : 'Взяти участь'}
          </Button>
        )}
      </div>
    </div>
  )
}
