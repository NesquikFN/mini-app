import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Clock, Home, MapPin, PartyPopper } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDormitories } from '../hooks/useDormitories'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { UserRow } from '../components/UserRow'
import { ParticipantsModal } from '../components/ParticipantsModal'
import { formatEventDate, formatEventTime } from '../utils/date'
import { fetchEventDetail, getErrorMessage, type EventDetailResponse } from '../services/api'

type MembersStatus = 'loading' | 'success' | 'error'

const PARTICIPANTS_PREVIEW_COUNT = 4

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
  const { getDormitoryName } = useDormitories()
  const [actionError, setActionError] = useState<string | null>(null)

  const [members, setMembers] = useState<EventDetailResponse | null>(null)
  const [membersStatus, setMembersStatus] = useState<MembersStatus>('loading')
  const [showAllParticipants, setShowAllParticipants] = useState(false)

  const loadMembers = useCallback(() => {
    if (!id) return
    fetchEventDetail(id)
      .then((data) => {
        setMembers(data)
        setMembersStatus('success')
      })
      .catch(() => {
        setMembersStatus('error')
      })
  }, [id])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

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
      // Учасники в event (з контексту) вже оновились одразу — а от
      // аватарки/імена в members довантажуємо окремо, щоб не тримати
      // важкі профілі всіх учасників у спільному EventsContext.
      loadMembers()
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  const previewParticipants = members?.participants.slice(0, PARTICIPANTS_PREVIEW_COUNT) ?? []
  const hasMoreParticipants = (members?.participants.length ?? 0) > PARTICIPANTS_PREVIEW_COUNT

  return (
    <div className="flex flex-col">
      <PageHeader title={event.title} showBack />

      <div className="flex flex-col gap-5 px-4 py-4 pb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
            <PartyPopper size={24} />
          </span>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {event.title}
          </h1>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 text-sm text-[var(--text-primary)]">
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={16} className="text-[var(--text-secondary)]" />{' '}
            {formatEventDate(event.date)}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock size={16} className="text-[var(--text-secondary)]" />{' '}
            {formatEventTime(event.time)}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin size={16} className="text-[var(--text-secondary)]" /> {event.location}
          </span>
          {getDormitoryName(event.dormitoryId) && (
            <span className="inline-flex items-center gap-2">
              <Home size={16} className="text-[var(--text-secondary)]" />{' '}
              {getDormitoryName(event.dormitoryId)}
            </span>
          )}
        </div>

        {event.description && (
          <section>
            <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
              Опис
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {event.description}
            </p>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Організатор</h2>
          {membersStatus === 'loading' && (
            <div className="h-10 animate-pulse rounded-xl bg-[var(--surface-card-alt)]" />
          )}
          {membersStatus === 'error' && (
            <p className="text-sm text-[var(--text-secondary)]">
              Не вдалося завантажити організатора.
            </p>
          )}
          {membersStatus === 'success' && members && (
            <UserRow user={members.creator} />
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Учасники · {event.participants.length}/{event.maxParticipants}
          </h2>

          {membersStatus === 'loading' && (
            <div className="flex flex-col gap-3">
              <div className="h-10 animate-pulse rounded-xl bg-[var(--surface-card-alt)]" />
              <div className="h-10 animate-pulse rounded-xl bg-[var(--surface-card-alt)]" />
            </div>
          )}

          {membersStatus === 'error' && (
            <p className="text-sm text-[var(--text-secondary)]">
              Не вдалося завантажити учасників.
            </p>
          )}

          {membersStatus === 'success' && members && (
            <>
              {members.participants.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Поки що ніхто не приєднався
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {previewParticipants.map((participant) => (
                    <UserRow key={participant.id} user={participant} />
                  ))}
                </div>
              )}

              {hasMoreParticipants && (
                <button
                  type="button"
                  onClick={() => setShowAllParticipants(true)}
                  className="self-start text-sm font-medium text-[var(--accent)] active:text-[var(--accent-hover)]"
                >
                  Показати всіх
                </button>
              )}
            </>
          )}
        </section>

        {actionError && <p className="text-sm text-red-400">{actionError}</p>}

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

      {showAllParticipants && members && (
        <ParticipantsModal
          participants={members.participants}
          onClose={() => setShowAllParticipants(false)}
        />
      )}
    </div>
  )
}
