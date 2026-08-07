import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Clock, Home, MapPin, Trash2, UserX } from 'lucide-react'
import { Button } from '../../components/Button'
import { UserRow } from '../../components/UserRow'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useTelegramBackButton } from '../../hooks/useTelegramBackButton'
import { useDormitories } from '../../hooks/useDormitories'
import { formatEventDate, formatEventTime } from '../../utils/date'
import {
  deleteAdminEvent,
  fetchAdminEventDetail,
  getErrorMessage,
  removeAdminParticipant,
} from '../../services/api'
import type { AdminEventDetail } from '../../types/admin'
import type { PublicUser } from '../../types/user'

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
  }, [id])

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
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{event.description}</p>
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
