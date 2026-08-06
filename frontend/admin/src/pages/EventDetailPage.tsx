import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, Pencil, Trash2, UserX } from 'lucide-react'
import { Button } from '../components/Button'
import { EventForm } from '../components/EventForm'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import {
  deleteEvent,
  fetchEventDetail,
  getErrorMessage,
  removeParticipant,
  updateEvent,
  type EventDetail,
} from '../services/api'
import { formatEventDate, formatEventTime } from '../utils/date'

type Status = 'loading' | 'success' | 'error'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    if (!id) return
    fetchEventDetail(id)
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

  if (!id) return null

  if (status === 'loading') return <LoadingState label="Завантажуємо подію…" />

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

  const { event, participants } = detail

  async function handleUpdate(input: Parameters<typeof updateEvent>[1]) {
    setSavingEdit(true)
    setActionError(null)
    try {
      await updateEvent(id!, input)
      setEditing(false)
      load()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Видалити цю подію? Дію неможливо скасувати.')) return
    setDeleting(true)
    setActionError(null)
    try {
      await deleteEvent(id!)
      navigate('/events')
    } catch (error) {
      setActionError(getErrorMessage(error))
      setDeleting(false)
    }
  }

  async function handleRemoveParticipant(userId: string) {
    if (!window.confirm('Видалити цього учасника з події?')) return
    setRemovingUserId(userId)
    setActionError(null)
    try {
      await removeParticipant(id!, userId)
      load()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">{event.title}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing((v) => !v)}>
            <Pencil size={16} /> {editing ? 'Скасувати редагування' : 'Редагувати'}
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            <Trash2 size={16} /> Видалити подію
          </Button>
        </div>
      </div>

      {actionError && (
        <p className="max-w-xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{actionError}</p>
      )}

      {editing ? (
        <EventForm
          initialValues={{
            title: event.title,
            description: event.description,
            date: event.date,
            // Backend/Postgres повертає HH:MM:SS, а <input type="time">
            // без секундного step приймає лише HH:MM — без обрізання поле
            // мовчки лишається порожнім і форма падає з 400 при збереженні.
            time: formatEventTime(event.time),
            location: event.location,
            maxParticipants: event.maxParticipants,
          }}
          onSubmit={handleUpdate}
          submitting={savingEdit}
          submitLabel="Зберегти зміни"
          submittingLabel="Зберігаємо…"
        />
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 max-w-xl">
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={16} className="text-neutral-400" /> {formatEventDate(event.date)}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock size={16} className="text-neutral-400" /> {formatEventTime(event.time)}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin size={16} className="text-neutral-400" /> {event.location}
          </span>
          {event.description && <p className="pt-2 text-neutral-600">{event.description}</p>}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">
          Учасники ({participants.length} / {event.maxParticipants})
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-neutral-500">Ще ніхто не приєднався.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Ім'я</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Telegram ID</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {participants.map((participant) => (
                  <tr key={participant.id} className="text-neutral-800">
                    <td className="px-4 py-3 font-medium">
                      {participant.firstName} {participant.lastName ?? ''}
                      {participant.id === event.creatorId && (
                        <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                          Організатор
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {participant.username ? `@${participant.username}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500">{participant.telegramId}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        loading={removingUserId === participant.id}
                        onClick={() => handleRemoveParticipant(participant.id)}
                      >
                        <UserX size={14} /> Видалити з події
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
