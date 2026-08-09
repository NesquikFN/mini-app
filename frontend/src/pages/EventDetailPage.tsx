import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, CalendarDays, Clock, Home, MapPin, MessageCircle, MonitorPlay, PartyPopper, Pencil, Trash2, UserX } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDormitories } from '../hooks/useDormitories'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { UserRow } from '../components/UserRow'
import { ParticipantsModal } from '../components/ParticipantsModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatEventDate, formatEventTime, isEventPast } from '../utils/date'
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
    deleteEvent,
    removeParticipant: removeParticipantFromEvent,
    pendingEventId,
  } = useEvents()
  const {
    user,
    status: userStatus,
    errorMessage: userError,
    reload: reloadUser,
  } = useCurrentUser()
  const { getDormitoryName } = useDormitories()
  const navigate = useNavigate()
  const [actionError, setActionError] = useState<string | null>(null)

  const [members, setMembers] = useState<EventDetailResponse | null>(null)
  const [membersStatus, setMembersStatus] = useState<MembersStatus>('loading')
  const [showAllParticipants, setShowAllParticipants] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [participantPendingRemoval, setParticipantPendingRemoval] = useState<
    EventDetailResponse['participants'][number] | null
  >(null)
  const [removingParticipantId, setRemovingParticipantId] = useState<string | null>(null)

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

  if (userStatus === 'loading' || (eventsStatus === 'loading' && membersStatus === 'loading')) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <LoadingState label="Завантажуємо подію…" />
      </div>
    )
  }

  if (eventsStatus === 'error' && membersStatus === 'error') {
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

  // Detail data is authoritative here. The shared events list may be
  // filtered to the current dormitory, while profile links can point to
  // an event from a different dormitory.
  const event = events.find((item) => item.id === id) ?? members?.event

  if (!event && membersStatus === 'loading') {
    return (
      <div className="flex flex-col">
        <PageHeader title="Подія" showBack />
        <LoadingState label="Завантажуємо подію…" />
      </div>
    )
  }

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
  const isCreator = event.creatorId === user.id
  const eventId = event.id
  const dormitoryName = getDormitoryName(event.dormitoryId)
  const dormitoryNumber = dormitoryName?.match(/№?\s*(\d+)/)?.[1]
  const telegramGroupUrl = event.groupUrl
    ? normalizeTelegramGroupUrl(event.groupUrl)
    : undefined
  const isArchived = isEventPast(event.date, event.time)

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

  async function handleDeleteEvent() {
    setDeleting(true)
    setActionError(null)
    try {
      await deleteEvent(eventId)
      navigate('/events', { replace: true, state: { successMessage: 'Подію видалено.' } })
    } catch (error) {
      setActionError(getErrorMessage(error))
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  async function handleRemoveParticipant() {
    if (!participantPendingRemoval) return
    setRemovingParticipantId(participantPendingRemoval.id)
    setActionError(null)
    try {
      await removeParticipantFromEvent(eventId, participantPendingRemoval.id)
      setParticipantPendingRemoval(null)
      loadMembers()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setRemovingParticipantId(null)
    }
  }

  const previewParticipants = members?.participants.slice(0, PARTICIPANTS_PREVIEW_COUNT) ?? []
  const hasMoreParticipants = (members?.participants.length ?? 0) > PARTICIPANTS_PREVIEW_COUNT

  return (
    <div className="flex flex-col">
      <PageHeader title={event.title} showBack />

      <div className="flex flex-col gap-5 px-4 py-4 pb-8">
        {isArchived && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
            <Archive size={18} className="text-[var(--accent)]" />
            Подію завершено та перенесено в архів
          </div>
        )}
        {event.imageUrl && (
          <div className="relative overflow-hidden rounded-2xl">
            <img
              src={event.imageUrl}
              alt={`Фотографія події «${event.title}»`}
              className="h-56 w-full object-cover"
            />
            <div className="absolute inset-x-0 top-0 flex flex-nowrap items-center gap-1 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2 pb-10 pt-2">
              <MetaBadge icon={<CalendarDays size={15} />}>
                {formatEventDate(event.date)}
              </MetaBadge>
              <MetaBadge icon={<Clock size={15} />}>
                {formatEventTime(event.time)}
              </MetaBadge>
              <MetaBadge
                icon={event.isOnline ? <MonitorPlay size={15} /> : <MapPin size={15} />}
                flexible
              >
                {event.isOnline ? 'Онлайн' : event.location}
              </MetaBadge>
              {!event.isOnline && dormitoryNumber && (
                <MetaBadge icon={<Home size={15} />}>
                  №{dormitoryNumber}
                </MetaBadge>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
            <PartyPopper size={24} />
          </span>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {event.title}
          </h1>
        </div>

        {isCreator && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigate(`/events/${event.id}/edit`)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--surface-border)] text-sm font-semibold text-[var(--text-primary)] active:bg-[var(--surface-card-alt)]"
            >
              <Pencil size={16} /> Редагувати
            </button>
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={16} /> Видалити
            </Button>
          </div>
        )}

        {!event.imageUrl && (
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
              {event.isOnline ? (
                <MonitorPlay size={16} className="text-[var(--accent)]" />
              ) : (
                <MapPin size={16} className="text-[var(--text-secondary)]" />
              )}
              {event.isOnline ? 'Онлайн' : event.location}
            </span>
            {!event.isOnline && dormitoryName && (
              <span className="inline-flex items-center gap-2">
                <Home size={16} className="text-[var(--text-secondary)]" />{' '}
                {dormitoryName}
              </span>
            )}
          </div>
        )}

        {event.description && (
          <section>
            <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
              Опис
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
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
                    <div key={participant.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <UserRow user={participant} />
                      </div>
                      {isCreator && participant.id !== event.creatorId && (
                        <Button
                          variant="outline"
                          loading={removingParticipantId === participant.id}
                          onClick={() => setParticipantPendingRemoval(participant)}
                        >
                          <UserX size={15} />
                        </Button>
                      )}
                    </div>
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

        {telegramGroupUrl && !isArchived && (
          <a
            href={telegramGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(clickEvent) => {
              const openTelegramLink = window.Telegram?.WebApp?.openTelegramLink
              if (!openTelegramLink) return
              clickEvent.preventDefault()
              openTelegramLink.call(window.Telegram?.WebApp, telegramGroupUrl)
            }}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-soft-bg)] px-5 text-[15px] font-semibold text-[var(--accent)] transition-transform active:scale-[0.97]"
          >
            <MessageCircle size={19} />
            Приєднатися до групи
          </a>
        )}

        {isArchived ? (
          <Button variant="secondary" fullWidth disabled>
            Подія завершена
          </Button>
        ) : isFull && !isJoined ? (
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
          removable={isCreator}
          creatorId={event.creatorId}
          pendingUserId={removingParticipantId}
          onRemove={setParticipantPendingRemoval}
          onClose={() => setShowAllParticipants(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Видалити подію?"
          description={`«${event.title}» буде видалено разом зі списком учасників.`}
          confirmLabel="Видалити"
          loading={deleting}
          onConfirm={handleDeleteEvent}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {participantPendingRemoval && (
        <ConfirmDialog
          title="Видалити учасника?"
          description={`${participantPendingRemoval.firstName} більше не братиме участі в цій події.`}
          confirmLabel="Видалити"
          loading={removingParticipantId !== null}
          onConfirm={handleRemoveParticipant}
          onCancel={() => setParticipantPendingRemoval(null)}
        />
      )}
    </div>
  )
}

function normalizeTelegramGroupUrl(value: string): string {
  return value.startsWith('@') ? `https://t.me/${value.slice(1)}` : value
}

function MetaBadge({
  icon,
  children,
  flexible = false,
}: {
  icon: ReactNode
  children: ReactNode
  flexible?: boolean
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm ${
        flexible ? 'max-w-[40%] shrink' : 'shrink-0'
      }`}
    >
      <span className="shrink-0 text-orange-400">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  )
}
