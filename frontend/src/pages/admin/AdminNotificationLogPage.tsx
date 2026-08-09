import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, History, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PaginationControls } from '../../components/PaginationControls'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { clearAdminNotificationLog, fetchAdminNotificationLog, getErrorMessage } from '../../services/api'
import type { NotificationKind, NotificationLogEntry, NotificationLogResponse } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'
const LIMIT = 30

const KIND_LABELS: Record<NotificationKind, string> = {
  group_announcement: 'Анонс у груповий чат',
  personal_announcement: 'Особисте сповіщення про подію',
  event_reminder: 'Нагадування за 30 хв',
  join_confirmation: 'Підтвердження приєднання',
  start_greeting: 'Привітання /start',
  notifications_off_confirmation: 'Підтвердження /notifications_off',
  registration_approved: 'Схвалення реєстрації',
}

export function AdminNotificationLogPage() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<NotificationLogResponse | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const runFetch = useCallback(() => {
    fetchAdminNotificationLog(page, LIMIT)
      .then((res) => {
        setData(res)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [page])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  async function handleClear() {
    setClearing(true)
    setErrorMessage(null)
    try {
      await clearAdminNotificationLog()
      setConfirmingClear(false)
      setPage(1)
      retry()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Журнал сповіщень</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Усі повідомлення, які бот коли-небудь надсилав — кому, коли і чи вдало.
          </p>
        </div>
        {status === 'success' && data && data.entries.length > 0 && (
          <Button variant="outline" onClick={() => setConfirmingClear(true)}>
            <Trash2 size={16} /> Очистити
          </Button>
        )}
      </div>

      {status === 'loading' && <LoadingState label="Завантажуємо журнал…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити журнал"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && data && data.entries.length === 0 && (
        <EmptyState icon={<History size={34} />} title="Бот ще нічого не надсилав" />
      )}

      {status === 'success' && errorMessage && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </p>
      )}

      {status === 'success' && data && data.entries.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {data.entries.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
          <PaginationControls pagination={data.pagination} onPageChange={setPage} />
        </>
      )}

      {confirmingClear && (
        <ConfirmDialog
          title="Очистити журнал сповіщень?"
          description="Усі записи про надіслані повідомлення буде видалено безповоротно."
          confirmLabel="Очистити"
          loading={clearing}
          onConfirm={handleClear}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
    </div>
  )
}

function LogRow({ entry }: { entry: NotificationLogEntry }) {
  const recipient = entry.recipientName ?? (entry.chatId.startsWith('-') ? 'Груповий чат' : `telegram_id: ${entry.chatId}`)

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{recipient}</p>
          <p className="text-xs text-[var(--text-secondary)]">{KIND_LABELS[entry.kind]}</p>
        </div>
        {entry.success ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={13} /> Надіслано
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
            <AlertCircle size={13} /> Помилка
          </span>
        )}
      </div>

      {entry.eventTitle && (
        <p className="text-xs text-[var(--text-secondary)]">
          Подія:{' '}
          {entry.eventId ? (
            <Link to={`/admin/events/${entry.eventId}`} className="font-medium text-[var(--accent)]">
              {entry.eventTitle}
            </Link>
          ) : (
            <span className="font-medium">{entry.eventTitle}</span>
          )}
        </p>
      )}

      {!entry.success && entry.errorMessage && (
        <p className="truncate text-xs text-red-400" title={entry.errorMessage}>
          {entry.errorMessage}
        </p>
      )}

      <p className="text-xs text-[var(--text-disabled)]">
        {new Date(entry.createdAt).toLocaleString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
  )
}
