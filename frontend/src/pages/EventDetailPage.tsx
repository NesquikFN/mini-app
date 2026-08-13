import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, BadgeCheck, CalendarDays, ChevronDown, ChevronUp, Crown, ExternalLink, Home, Hourglass, MapPin, MessageCircle, MonitorPlay, PartyPopper, Pencil, Share2, Trash2, Users } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDormitories } from '../hooks/useDormitories'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { UserRow } from '../components/UserRow'
import { ParticipantsModal } from '../components/ParticipantsModal'
import { ShareEventSheet } from '../components/ShareEventSheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormattedText } from '../components/FormattedText'
import { ParticipantProfileRow } from '../components/ParticipantProfileRow'
import { EventRatingSection } from '../components/EventRatingSection'
import { ReliableOrganizerBadge } from '../components/ReliableOrganizerBadge'
import { formatEventDate, formatEventTime, isEventPast } from '../utils/date'
import {
  fetchEventDetail,
  fetchEventWaitlist,
  getErrorMessage,
  removeEventWaitlistEntry,
  type EventDetailResponse,
} from '../services/api'

type MembersStatus = 'loading' | 'success' | 'error'

const PARTICIPANTS_PREVIEW_COUNT = 4
const MEMBERS_REFRESH_INTERVAL_MS = 5_000

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
    joinWaitlist,
    leaveWaitlist,
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
  const [shareSheetOpen, setShareSheetOpen] = useState(false)

  const [members, setMembers] = useState<EventDetailResponse | null>(null)
  const [membersStatus, setMembersStatus] = useState<MembersStatus>('loading')
  const [showAllParticipants, setShowAllParticipants] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [participantPendingRemoval, setParticipantPendingRemoval] = useState<
    EventDetailResponse['participants'][number] | null
  >(null)
  const [removingParticipantId, setRemovingParticipantId] = useState<string | null>(null)
  const membersRequestId = useRef(0)
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlist, setWaitlist] = useState<EventDetailResponse['participants']>([])
  const [waitlistEntryPendingRemoval, setWaitlistEntryPendingRemoval] = useState<
    EventDetailResponse['participants'][number] | null
  >(null)
  const [removingWaitlistId, setRemovingWaitlistId] = useState<string | null>(null)
  const [promotedNotice, setPromotedNotice] = useState(false)
  // Чи був користувач у черзі на попередньому рендері — щоб помітити
  // момент, коли фонове оновлення перевело його в учасники.
  const wasWaitlisted = useRef(false)

  const loadMembers = useCallback((silent = false) => {
    if (!id) return
    const requestId = ++membersRequestId.current
    fetchEventDetail(id)
      .then((data) => {
        if (requestId !== membersRequestId.current) return
        setMembers(data)
        setMembersStatus('success')
      })
      .catch(() => {
        if (requestId !== membersRequestId.current || silent) return
        setMembersStatus('error')
      })
  }, [id])

  useEffect(() => {
    loadMembers()

    const refreshMembers = () => {
      if (document.visibilityState === 'visible') loadMembers(true)
    }
    const refreshTimer = window.setInterval(refreshMembers, MEMBERS_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshMembers)

    return () => {
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', refreshMembers)
      membersRequestId.current += 1
    }
  }, [loadMembers])

  // Автоматичне переведення з черги в учасники помічається тим самим
  // фоновим оновленням, що вже працює на цій сторінці — окремого
  // опитування не додаємо. Перехід «був у черзі → більше не в черзі, але
  // вже учасник» і є моментом, коли місце звільнилось.
  useEffect(() => {
    const detailEvent = members?.event
    if (!detailEvent || !user) return

    const nowWaitlisted = detailEvent.viewerWaitlistPosition !== undefined
    const nowJoined = detailEvent.participants.includes(user.id)
    if (wasWaitlisted.current && !nowWaitlisted && nowJoined) {
      setPromotedNotice(true)
    }
    wasWaitlisted.current = nowWaitlisted
  }, [members, user])

  const loadWaitlist = useCallback(() => {
    if (!id) return
    fetchEventWaitlist(id)
      .then(setWaitlist)
      .catch(() => {
        // Список черги — додаткова інформація для організатора; якщо він
        // не завантажився, решта сторінки має лишитись робочою.
      })
  }, [id])

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

  // Detail data is authoritative here. The shared events list may be an
  // older snapshot (it is fetched independently), while the detail response
  // contains the event and its participant profiles from the same request.
  // During a detail refresh we temporarily use the context copy so join/leave
  // mutations remain visible immediately.
  const event = membersStatus === 'success'
    ? members?.event
    : events.find((item) => item.id === id) ?? members?.event

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
  const waitlistCount = event.waitlistCount ?? 0
  const waitlistPosition = event.viewerWaitlistPosition
  const isWaitlisted = waitlistPosition !== undefined
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
      setMembersStatus('loading')
      loadMembers()
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  const handleToggleWaitlist = async () => {
    setActionError(null)
    try {
      if (isWaitlisted) {
        await leaveWaitlist(eventId)
      } else {
        // Якщо місце встигло звільнитись, backend виконує звичайне
        // приєднання — тоді користувач одразу стає учасником.
        const updated = await joinWaitlist(eventId)
        if (user && updated.participants.includes(user.id)) setPromotedNotice(true)
      }
      setMembersStatus('loading')
      loadMembers()
      if (showWaitlist) loadWaitlist()
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleRemoveFromWaitlist() {
    if (!waitlistEntryPendingRemoval) return
    setRemovingWaitlistId(waitlistEntryPendingRemoval.id)
    setActionError(null)
    try {
      await removeEventWaitlistEntry(eventId, waitlistEntryPendingRemoval.id)
      setWaitlistEntryPendingRemoval(null)
      loadWaitlist()
      loadMembers()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setRemovingWaitlistId(null)
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
      setMembersStatus('loading')
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

      <main className="relative z-[1] flex flex-col gap-6 px-4 pt-4 pb-44">
        {isArchived && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
            <Archive size={18} className="text-[var(--accent)]" />
            Подію завершено та перенесено в архів
          </div>
        )}
        {isArchived && <EventRatingSection eventId={event.id} />}
        {event.vipOnly && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-400">
            <Crown size={18} /> Подія тільки для VIP
          </div>
        )}
        {event.gpuOnly && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-400">
            <BadgeCheck size={18} /> Подія тільки для ГПУ
          </div>
        )}

        <section className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {membersStatus === 'loading' && (
              <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-card-alt)]" />
            )}
            {membersStatus === 'error' && (
              <p className="text-sm text-[var(--text-secondary)]">Організатор події</p>
            )}
            {membersStatus === 'success' && members && <UserRow user={members.creator} />}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent-soft-bg)] px-3 py-1.5 text-xs font-bold tracking-wide text-[var(--accent)]">
              <Crown size={14} /> ОРГАНІЗАТОР
            </span>
            {event.creatorReliable && <ReliableOrganizerBadge compact />}
          </div>
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
                <div className="flex flex-col gap-2.5">
                  {previewParticipants.map((participant) => (
                    <ParticipantProfileRow
                      key={participant.id}
                      participant={participant}
                      organizer={participant.id === event.creatorId}
                      removable={isCreator && participant.id !== event.creatorId}
                      removing={removingParticipantId === participant.id}
                      removeDisabled={removingParticipantId !== null && removingParticipantId !== participant.id}
                      onRemove={setParticipantPendingRemoval}
                    />
                  ))}
                </div>
              )}

              {hasMoreParticipants && (
                <button
                  type="button"
                  onClick={() => setShowAllParticipants(true)}
                  className="self-start rounded-full bg-[var(--accent-soft-bg)] px-3 py-2 text-sm font-semibold text-[var(--accent)] active:text-[var(--accent-hover)]"
                >
                  Показати всіх
                </button>
              )}
            </>
          )}

          {waitlistCount > 0 && (
            <div className="flex flex-col gap-2 border-t border-[var(--surface-border)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                  <Hourglass size={15} className="text-[var(--accent)]" /> У черзі: {waitlistCount}
                </p>
                {/* Повний список черги бачить лише організатор — решті
                    API його взагалі не повертає. */}
                {isCreator && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showWaitlist
                      setShowWaitlist(next)
                      if (next) loadWaitlist()
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
                  >
                    {showWaitlist ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showWaitlist ? 'Згорнути' : 'Показати чергу'}
                  </button>
                )}
              </div>

              {waitlistPosition !== undefined && (
                <p className="text-sm font-semibold text-[var(--accent)]">
                  Ваше місце в черзі: {waitlistPosition}
                </p>
              )}

              {isCreator && showWaitlist && (
                <div className="flex flex-col gap-2.5">
                  {waitlist.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">Черга порожня.</p>
                  ) : (
                    waitlist.map((entry, index) => (
                      <div key={entry.id} className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-center text-sm font-bold text-[var(--text-secondary)]">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <ParticipantProfileRow
                            participant={entry}
                            removable
                            removing={removingWaitlistId === entry.id}
                            removeDisabled={
                              removingWaitlistId !== null && removingWaitlistId !== entry.id
                            }
                            onRemove={setWaitlistEntryPendingRemoval}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {promotedNotice && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400">
            <PartyPopper size={18} /> Для вас звільнилося місце — ви вже серед учасників!
          </div>
        )}

        {actionError && <p className="text-sm text-red-400">{actionError}</p>}
      </main>

      <div className="fixed bottom-[calc(3.25rem+max(0.5rem,env(safe-area-inset-bottom)))] left-1/2 z-20 w-full max-w-[560px] -translate-x-1/2 border-t border-[var(--surface-border)] bg-[var(--surface-bg)] p-3">
        {/* Пояснення показуємо саме перед вступом у чергу — коли воно
            справді потрібне, а не постійно. */}
        {!isArchived && isFull && !isJoined && !isWaitlisted && (
          <p className="mb-2 text-center text-xs leading-snug text-[var(--text-secondary)]">
            Коли звільниться місце, ми автоматично додамо вас до учасників і повідомимо в Telegram.
          </p>
        )}
        {!isArchived && isWaitlisted && (
          <p className="mb-2 text-center text-xs font-semibold text-[var(--accent)]">
            Ваше місце в черзі: {waitlistPosition}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" fullWidth onClick={() => setShareSheetOpen(true)}>
            <Share2 size={19} /> Запросити
          </Button>
          {isArchived ? (
            <Button variant="secondary" fullWidth disabled>
              Завершено
            </Button>
          ) : isFull && !isJoined ? (
            // Заповнена подія більше не дає мертву кнопку «Немає місць»:
            // замість неї активний вступ у чергу (або вихід з неї).
            <Button
              variant={isWaitlisted ? 'outline' : 'primary'}
              fullWidth
              loading={isPending}
              disabled={isPending}
              onClick={handleToggleWaitlist}
            >
              <Hourglass size={17} />
              {isPending
                ? isWaitlisted
                  ? 'Виходжу…'
                  : 'Стаю в чергу…'
                : isWaitlisted
                  ? 'Вийти з черги'
                  : 'Стати в чергу'}
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

      {shareSheetOpen && (
        <ShareEventSheet
          eventId={eventId}
          eventTitle={eventTitle}
          locked={event.vipOnly || event.gpuOnly}
          onClose={() => setShareSheetOpen(false)}
        />
      )}

      {waitlistEntryPendingRemoval && (
        <ConfirmDialog
          title="Прибрати з черги?"
          description={`${waitlistEntryPendingRemoval.firstName} більше не чекатиме на місце в цій події.`}
          confirmLabel="Прибрати"
          loading={removingWaitlistId !== null}
          onConfirm={handleRemoveFromWaitlist}
          onCancel={() => setWaitlistEntryPendingRemoval(null)}
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
