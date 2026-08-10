import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, CalendarDays, Crown, ExternalLink, Home, MapPin, MessageCircle, MonitorPlay, PartyPopper, Pencil, Share2, Trash2, Users, UserX } from 'lucide-react'
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
import { FormattedText } from '../components/FormattedText'
import { formatEventDate, formatEventTime, isEventPast } from '../utils/date'
import { fetchEventDetail, fetchEventShareLink, getErrorMessage, type EventDetailResponse } from '../services/api'

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
  const [sharing, setSharing] = useState(false)

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
  const eventTitle = event.title
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

  async function handleShareEvent() {
    setSharing(true)
    setActionError(null)
    try {
      const eventUrl = await fetchEventShareLink(eventId)
      const shareUrl = new URL('https://t.me/share/url')
      shareUrl.searchParams.set('url', eventUrl)
      shareUrl.searchParams.set('text', `🎉 ${eventTitle}\nПриєднуйся до події в DormHub!`)

      const webApp = window.Telegram?.WebApp
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(shareUrl.toString())
      } else {
        window.open(shareUrl.toString(), '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSharing(false)
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
      <PageHeader title="Подія" showBack />

      <div className="relative overflow-hidden bg-[var(--surface-card-alt)]">
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={`Фотографія події «${event.title}»`}
            className="h-[min(72vw,390px)] min-h-64 w-full object-cover"
          />
        ) : (
          <div className="flex h-64 items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(255,122,0,0.24),transparent_55%),linear-gradient(145deg,#24170d,#0b0b0b)]">
            <PartyPopper size={76} strokeWidth={1.4} className="text-[var(--accent)]" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--surface-bg)] to-transparent" />
      </div>

      <main className="flex flex-col gap-6 px-4 pb-44">
        {isArchived && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
            <Archive size={18} className="text-[var(--accent)]" />
            Подію завершено та перенесено в архів
          </div>
        )}
        {event.vipOnly && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-400">
            <Crown size={18} /> Подія тільки для VIP
          </div>
        )}

        <section className="-mt-5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {membersStatus === 'loading' && (
              <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-card-alt)]" />
            )}
            {membersStatus === 'error' && (
              <p className="text-sm text-[var(--text-secondary)]">Організатор події</p>
            )}
            {membersStatus === 'success' && members && <UserRow user={members.creator} />}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent-soft-bg)] px-3 py-1.5 text-xs font-bold tracking-wide text-[var(--accent)]">
            <Crown size={14} /> ОРГАНІЗАТОР
          </span>
        </section>

        <section className="flex flex-col gap-3">
          <h1 className="text-[clamp(1.8rem,7vw,2.5rem)] font-black leading-[1.08] tracking-tight text-[var(--text-primary)]">
            {event.title}
          </h1>
          {event.description && (
            <FormattedText
              text={event.description}
              className="text-base leading-relaxed text-[var(--text-secondary)]"
            />
          )}
        </section>

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
            className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft-bg)] px-5 text-base font-bold text-[var(--text-primary)] transition-transform active:scale-[0.98]"
          >
            <MessageCircle size={22} className="text-[var(--accent)]" />
            Чат події
          </a>
        )}

        {event.gameUrl && (
          <a
            href={event.gameUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 text-base font-bold text-[var(--text-primary)] transition-transform active:scale-[0.98]"
          >
            <ExternalLink size={21} className="text-[var(--accent)]" />
            Відкрити гру
          </a>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Про подію</h2>
          <div className="overflow-hidden rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
            <InfoRow
              icon={event.isOnline ? <MonitorPlay size={22} /> : <MapPin size={22} />}
              title={event.isOnline ? 'Онлайн-подія' : event.location}
              description={event.isOnline ? 'Можна приєднатися з будь-якого місця' : dormitoryName ?? 'Місце проведення'}
            />
            <InfoRow
              icon={<Users size={22} />}
              title={`${event.participants.length} з ${event.maxParticipants} учасників`}
              description={isFull ? 'Усі місця зайняті' : `Вільних місць: ${event.maxParticipants - event.participants.length}`}
            />
            <InfoRow
              icon={<CalendarDays size={22} />}
              title={`${formatEventDate(event.date)}, ${formatEventTime(event.time)}`}
              description="Дата і час початку"
              last={event.isOnline || !dormitoryName}
            />
            {!event.isOnline && dormitoryName && (
              <InfoRow
                icon={<Home size={22} />}
                title={dormitoryName}
                description={dormitoryNumber ? `Гуртожиток №${dormitoryNumber}` : 'Гуртожиток'}
                last
              />
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
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
      </main>

      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-20 w-full max-w-[560px] -translate-x-1/2 border-t border-[var(--surface-border)] bg-[var(--surface-bg)]/95 p-3 backdrop-blur-xl">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" fullWidth loading={sharing} onClick={handleShareEvent}>
            <Share2 size={19} /> {sharing ? 'Готую…' : 'Запросити'}
          </Button>
          {isArchived ? (
            <Button variant="secondary" fullWidth disabled>
              Завершено
            </Button>
          ) : isFull && !isJoined ? (
            <Button variant="secondary" fullWidth disabled>
              Немає місць
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
                  ? 'Не піду'
                  : 'Я піду!'}
            </Button>
          )}
        </div>
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

function InfoRow({
  icon,
  title,
  description,
  last = false,
}: {
  icon: ReactNode
  title: string
  description: string
  last?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-4 ${last ? '' : 'border-b border-[var(--surface-border)]'}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-[var(--text-secondary)]">{description}</span>
      </span>
    </div>
  )
}
