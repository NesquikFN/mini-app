import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Home,
  Hourglass,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Star,
  Trash2,
  UserX,
} from 'lucide-react'
import { Button } from '../../components/Button'
import { UserRow } from '../../components/UserRow'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useTelegramBackButton } from '../../hooks/useTelegramBackButton'
import { useDormitories } from '../../hooks/useDormitories'
import { FormattedText } from '../../components/FormattedText'
import { formatEventDate, formatEventTime } from '../../utils/date'
import {
  deleteAdminEvent,
  fetchAdminEventDetail,
  fetchAdminEventWaitlist,
  getErrorMessage,
  removeAdminEventRating,
  removeAdminEventWaitlistEntry,
  removeAdminParticipant,
  restoreAdminEventRating,
} from '../../services/api'
import type { AdminEventDetail, AdminEventRatingEntry } from '../../types/admin'
import type { PublicUser } from '../../types/user'
import { EVENT_RATING_TAG_LABELS } from '../../types/eventRating'

type Status = 'loading' | 'success' | 'error'

export function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getDormitoryName } = useDormitories()

  const [detail, setDetail] = useState<AdminEventDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [deletingEvent, setDeletingEvent] = useState(false)
  const [confirmingDeleteEvent, setConfirmingDeleteEvent] = useState(false)
  const [participantPendingRemoval, setParticipantPendingRemoval] = useState<PublicUser | null>(
    null,
  )
  const [removingParticipant, setRemovingParticipant] = useState(false)
  const [waitlist, setWaitlist] = useState<PublicUser[]>([])
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlistPendingRemoval, setWaitlistPendingRemoval] = useState<PublicUser | null>(null)
  const [removingWaitlist, setRemovingWaitlist] = useState(false)
  const [showRatings, setShowRatings] = useState(false)
  const [moderatingRatingId, setModeratingRatingId] = useState<string | null>(null)

  const loadWaitlist = useCallback(() => {
    if (!id) return
    fetchAdminEventWaitlist(id)
      .then(setWaitlist)
      .catch(() => {
        // Черга — додаткова інформація; її відсутність не повинна
        // ламати сторінку події.
      })
  }, [id])

  const runFetch = useCallback(() => {
    if (!id) return
    fetchAdminEventDetail(id)
      .then((data) => {
        setDetail(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
    loadWaitlist()
  }, [id, loadWaitlist])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const load = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  useTelegramBackButton(true, () => navigate('/admin/events'))

  if (!id) return null

  if (status === 'loading') {
    return <LoadingState label="Завантажуємо подію…" />
  }

  if (status === 'error' || !detail) {
    return (
      <EmptyState
        title="Не вдалося завантажити подію"
        description={errorMessage ?? undefined}
        actionLabel="Спробувати ще раз"
        onAction={load}
      />
    )
  }

  const { event, creator, participants } = detail

  async function handleDeleteEvent() {
    if (!id) return
    setDeletingEvent(true)
    setActionError(null)
    try {
      await deleteAdminEvent(id)
      navigate('/admin/events')
    } catch (error) {
      setActionError(getErrorMessage(error))
      setDeletingEvent(false)
    }
  }

  async function handleRemoveParticipant() {
    if (!id || !participantPendingRemoval) return
    setRemovingParticipant(true)
    setActionError(null)
    try {
      await removeAdminParticipant(id, participantPendingRemoval.id)
      setParticipantPendingRemoval(null)
      load()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setRemovingParticipant(false)
    }
  }

  async function handleRemoveFromWaitlist() {
    if (!id || !waitlistPendingRemoval) return
    setRemovingWaitlist(true)
    setActionError(null)
    try {
      await removeAdminEventWaitlistEntry(id, waitlistPendingRemoval.id)
      setWaitlistPendingRemoval(null)
      load()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setRemovingWaitlist(false)
    }
  }

  async function handleToggleModeration(rating: AdminEventRatingEntry) {
    setModeratingRatingId(rating.id)
    setActionError(null)
    try {
      if (rating.moderatedAt) {
        await restoreAdminEventRating(rating.id)
      } else {
        await removeAdminEventRating(rating.id)
      }
      load()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setModeratingRatingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{event.title}</h1>
        <Button variant="danger" onClick={() => setConfirmingDeleteEvent(true)}>
          <Trash2 size={16} /> Видалити подію
        </Button>
      </div>

      {actionError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{actionError}</p>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 text-sm text-[var(--text-primary)]">
        <span className="inline-flex items-center gap-2">
          <CalendarDays size={16} className="text-[var(--text-disabled)]" /> {formatEventDate(event.date)}
        </span>
        <span className="inline-flex items-center gap-2">
          <Clock size={16} className="text-[var(--text-disabled)]" /> {formatEventTime(event.time)}
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin size={16} className="text-[var(--text-disabled)]" /> {event.location}
        </span>
        {getDormitoryName(event.dormitoryId) && (
          <span className="inline-flex items-center gap-2">
            <Home size={16} className="text-[var(--text-disabled)]" /> {getDormitoryName(event.dormitoryId)}
          </span>
        )}
      </div>

      {event.description && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Опис</h2>
          <FormattedText
            text={event.description}
            className="text-sm leading-relaxed text-[var(--text-secondary)]"
          />
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Організатор</h2>
        <UserRow user={creator} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Учасники {participants.length}/{event.maxParticipants}
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Поки що ніхто не приєднався</p>
        ) : (
          <div className="flex flex-col gap-2">
            {participants.map((participant) => {
              const isOrganizer = participant.id === creator.id
              return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--surface-border)] p-2"
                >
                  <UserRow user={participant} />
                  {isOrganizer ? (
                    <span className="shrink-0 rounded-full bg-[var(--surface-card-alt)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                      Організатор
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setParticipantPendingRemoval(participant)}
                    >
                      <UserX size={14} /> Видалити
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {waitlist.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
          <button
            type="button"
            onClick={() => setShowWaitlist((current) => !current)}
            className="flex items-center justify-between gap-2"
          >
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Hourglass size={15} className="text-[var(--accent)]" /> Черга · {waitlist.length}
            </h2>
            <span className="text-[var(--accent)]">
              {showWaitlist ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </button>

          {showWaitlist && (
            <div className="flex flex-col gap-2">
              {waitlist.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--surface-border)] p-2"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-[var(--text-secondary)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <UserRow user={entry} />
                  </div>
                  <Button variant="outline" onClick={() => setWaitlistPendingRemoval(entry)}>
                    <UserX size={14} /> Прибрати
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {detail.ratings.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
          <button
            type="button"
            onClick={() => setShowRatings((current) => !current)}
            className="flex items-center justify-between gap-2"
          >
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Star size={15} className="text-[var(--accent)]" /> Оцінки · {detail.ratings.length}
            </h2>
            <span className="text-[var(--accent)]">
              {showRatings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </button>

          {showRatings && (
            <div className="flex flex-col gap-2">
              {detail.ratings.map((rating) => (
                <div
                  key={rating.id}
                  className={`flex flex-col gap-2 rounded-xl border p-3 ${
                    rating.moderatedAt
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-[var(--surface-border)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {rating.userName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {new Date(rating.createdAt).toLocaleString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft-bg)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">
                      <Star size={12} /> {rating.rating}
                    </span>
                  </div>

                  {rating.tags.length > 0 && (
                    <p className="text-xs text-[var(--text-secondary)]">
                      {rating.tags.map((tag) => EVENT_RATING_TAG_LABELS[tag]).join(', ')}
                    </p>
                  )}

                  {rating.moderatedAt && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
                      <ShieldAlert size={13} /> Виключено з рейтингу
                    </p>
                  )}

                  <Button
                    variant="outline"
                    loading={moderatingRatingId === rating.id}
                    disabled={moderatingRatingId !== null && moderatingRatingId !== rating.id}
                    onClick={() => handleToggleModeration(rating)}
                  >
                    {rating.moderatedAt ? (
                      <>
                        <RotateCcw size={14} /> Відновити
                      </>
                    ) : (
                      <>
                        <ShieldAlert size={14} /> Виключити як підозрілу
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {waitlistPendingRemoval && (
        <ConfirmDialog
          title="Прибрати з черги?"
          description={`${waitlistPendingRemoval.firstName} більше не чекатиме на місце в цій події.`}
          confirmLabel="Прибрати"
          loading={removingWaitlist}
          onConfirm={handleRemoveFromWaitlist}
          onCancel={() => setWaitlistPendingRemoval(null)}
        />
      )}

      {confirmingDeleteEvent && (
        <ConfirmDialog
          title="Видалити подію?"
          description={`«${event.title}» — цю дію неможливо скасувати.`}
          confirmLabel="Видалити"
          loading={deletingEvent}
          onConfirm={handleDeleteEvent}
          onCancel={() => setConfirmingDeleteEvent(false)}
        />
      )}

      {participantPendingRemoval && (
        <ConfirmDialog
          title="Видалити учасника з події?"
          description={`${participantPendingRemoval.firstName} більше не братиме участі в цій події.`}
          confirmLabel="Видалити"
          loading={removingParticipant}
          onConfirm={handleRemoveParticipant}
          onCancel={() => setParticipantPendingRemoval(null)}
        />
      )}
    </div>
  )
}
