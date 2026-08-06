import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { participantsById, currentUser } from '../services/mockData'
import { PageHeader } from '../components/PageHeader'
import { ParticipantList } from '../components/ParticipantList'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { formatEventDate } from '../utils/date'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { events, status, joinEvent, leaveEvent, pendingEventId } = useEvents()
  const [actionError, setActionError] = useState<string | null>(null)

  if (status === 'loading') {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <LoadingState label="Завантажуємо подію…" />
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

  const isJoined = event.participantIds.includes(currentUser.id)
  const isFull = event.participantIds.length >= event.maxParticipants
  const isPending = pendingEventId === event.id
  const participants = event.participantIds
    .map((participantId) => participantsById[participantId])
    .filter(Boolean)

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
      setActionError(
        error instanceof Error ? error.message : 'Щось пішло не так',
      )
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title={event.title} showBack />

      <div className="flex flex-col gap-5 px-4 py-4 pb-8">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none">{event.emoji}</span>
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
            <Clock size={16} className="text-neutral-400" /> {event.time}
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

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Учасники</h2>
            <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
              <Users size={14} /> {event.participantIds.length} /{' '}
              {event.maxParticipants}
            </span>
          </div>
          <ParticipantList participants={participants} />
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
            {isJoined ? 'Скасувати участь' : 'Взяти участь'}
          </Button>
        )}
      </div>
    </div>
  )
}
