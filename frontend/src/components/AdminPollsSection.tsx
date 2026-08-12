import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Pencil, Send, SquarePlus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { LoadingState } from './LoadingState'
import { EmptyState } from './EmptyState'
import { PollComposer } from './PollComposer'
import { PollBroadcastModal } from './PollBroadcastModal'
import {
  createAdminPoll,
  deleteAdminPoll,
  fetchAdminPolls,
  finishAdminPoll,
  getErrorMessage,
  publishAdminPoll,
  updateAdminPoll,
} from '../services/api'
import { POLL_AUDIENCE_LABELS, type AdminPoll, type PollAudience, type PollBroadcastReport } from '../types/poll'

type Status = 'loading' | 'success' | 'error'

const STATUS_LABELS: Record<AdminPoll['status'], string> = {
  draft: 'Чернетка',
  active: 'Активне',
  finished: 'Завершено',
}

const STATUS_STYLES: Record<AdminPoll['status'], string> = {
  draft: 'bg-[var(--surface-card)] text-[var(--text-secondary)]',
  active: 'bg-emerald-500/10 text-emerald-400',
  finished: 'bg-[var(--surface-card)] text-[var(--text-disabled)]',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Секція «Опитування майбутніх подій» в існуючій AdminNotificationsPage
 * — навмисно не окрема сторінка. Одночасно опубліковане (активне) може
 * бути лише одне опитування, тож publish інших чернеток сервер
 * відхилить 409-ю, поки активне не завершене. */
export function AdminPollsSection() {
  const [polls, setPolls] = useState<AdminPoll[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [composerOpen, setComposerOpen] = useState(false)
  const [editingPoll, setEditingPoll] = useState<AdminPoll | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [busyPollId, setBusyPollId] = useState<string | null>(null)

  const [pendingDeletion, setPendingDeletion] = useState<AdminPoll | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [broadcastTarget, setBroadcastTarget] = useState<AdminPoll | null>(null)

  const load = useCallback(() => {
    fetchAdminPolls()
      .then((data) => {
        setPolls(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function refresh() {
    setStatus('loading')
    setErrorMessage(null)
    load()
  }

  function openCreate() {
    setEditingPoll(null)
    setComposerError(null)
    setComposerOpen(true)
  }

  function openEdit(poll: AdminPoll) {
    setEditingPoll(poll)
    setComposerError(null)
    setComposerOpen(true)
  }

  async function handleComposerSubmit(input: { question: string; options: string[]; endsAt: string | null }) {
    setSubmitting(true)
    setComposerError(null)
    try {
      if (editingPoll) {
        const updated = await updateAdminPoll(editingPoll.id, input)
        setPolls((prev) => prev.map((poll) => (poll.id === updated.id ? updated : poll)))
      } else {
        const created = await createAdminPoll(input)
        setPolls((prev) => [created, ...prev])
      }
      setComposerOpen(false)
      setEditingPoll(null)
    } catch (error) {
      setComposerError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePublish(poll: AdminPoll) {
    setActionError(null)
    setBusyPollId(poll.id)
    try {
      const updated = await publishAdminPoll(poll.id)
      setPolls((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setBusyPollId(null)
    }
  }

  async function handleFinish(poll: AdminPoll) {
    setActionError(null)
    setBusyPollId(poll.id)
    try {
      const updated = await finishAdminPoll(poll.id)
      setPolls((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setBusyPollId(null)
    }
  }

  async function handleDelete() {
    if (!pendingDeletion) return
    setDeleting(true)
    setActionError(null)
    try {
      await deleteAdminPoll(pendingDeletion.id)
      setPolls((prev) => prev.filter((poll) => poll.id !== pendingDeletion.id))
      setPendingDeletion(null)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  function handleBroadcastSent(
    _report: PollBroadcastReport,
    meta: { at: string; audience: PollAudience },
  ) {
    setPolls((prev) =>
      prev.map((poll) =>
        poll.id === broadcastTarget?.id
          ? { ...poll, lastBroadcastAt: meta.at, lastBroadcastAudience: meta.audience }
          : poll,
      ),
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <BarChart3 size={18} className="text-[var(--accent)]" /> Опитування майбутніх подій
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Компактна картка «Що організувати наступним?» на головному екрані. Активним може бути
            лише одне опитування.
          </p>
        </div>
        <Button variant="outline" className="!h-10 !shrink-0 !px-3 !text-sm" onClick={openCreate}>
          <SquarePlus size={16} /> Створити
        </Button>
      </div>

      {status === 'loading' && <LoadingState label="Завантажуємо опитування…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити опитування"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={refresh}
        />
      )}

      {status === 'success' && polls.length === 0 && (
        <EmptyState
          icon={<BarChart3 size={34} />}
          title="Опитувань ще немає"
          description="Створіть перше — воно з'явиться на головному екрані після публікації."
        />
      )}

      {status === 'success' && polls.length > 0 && (
        <div className="flex flex-col gap-3">
          {polls.map((poll) => (
            <div
              key={poll.id}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
                  {poll.question}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[poll.status]}`}
                >
                  {STATUS_LABELS[poll.status]}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {poll.options.map((option) => (
                  <div
                    key={option.id}
                    className="relative overflow-hidden rounded-lg border border-[var(--surface-border)] px-2.5 py-1.5 text-xs"
                  >
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--accent)]/10"
                      style={{ width: `${option.percentage}%` }}
                    />
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--text-primary)]">{option.text}</span>
                      <span className="shrink-0 font-semibold text-[var(--text-secondary)]">
                        {option.percentage}% · {option.votes}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-[var(--text-secondary)]">
                Усього голосів: {poll.totalVotes}
                {poll.endsAt && ` · До ${formatDateTime(poll.endsAt)}`}
              </p>

              {poll.lastBroadcastAt && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Востаннє надіслано {formatDateTime(poll.lastBroadcastAt)}
                  {poll.lastBroadcastAudience ? ` (${POLL_AUDIENCE_LABELS[poll.lastBroadcastAudience]})` : ''}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {poll.status === 'draft' && (
                  <>
                    <Button
                      variant="outline"
                      className="!h-9 !px-3 !text-xs"
                      onClick={() => openEdit(poll)}
                    >
                      <Pencil size={13} /> Редагувати
                    </Button>
                    <Button
                      variant="primary"
                      className="!h-9 !px-3 !text-xs"
                      loading={busyPollId === poll.id}
                      onClick={() => handlePublish(poll)}
                    >
                      Опублікувати
                    </Button>
                  </>
                )}

                {poll.status === 'active' && (
                  <>
                    <Button
                      variant="outline"
                      className="!h-9 !px-3 !text-xs"
                      loading={busyPollId === poll.id}
                      onClick={() => handleFinish(poll)}
                    >
                      Завершити
                    </Button>
                    <Button
                      variant="primary"
                      className="!h-9 !px-3 !text-xs"
                      onClick={() => setBroadcastTarget(poll)}
                    >
                      <Send size={13} /> Надіслати
                    </Button>
                  </>
                )}

                <Button
                  variant="danger"
                  className="!h-9 !px-3 !text-xs"
                  onClick={() => setPendingDeletion(poll)}
                >
                  <Trash2 size={13} /> Видалити
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      {composerOpen && (
        <PollComposer
          initial={editingPoll}
          submitting={submitting}
          errorMessage={composerError}
          onSubmit={handleComposerSubmit}
          onClose={() => {
            setComposerOpen(false)
            setEditingPoll(null)
          }}
        />
      )}

      {pendingDeletion && (
        <ConfirmDialog
          title="Видалити опитування?"
          description={`«${pendingDeletion.question}» і всі голоси буде видалено безповоротно.`}
          confirmLabel="Видалити"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => {
            setPendingDeletion(null)
            setActionError(null)
          }}
        />
      )}

      {broadcastTarget && (
        <PollBroadcastModal
          poll={broadcastTarget}
          onClose={() => setBroadcastTarget(null)}
          onSent={handleBroadcastSent}
        />
      )}
    </section>
  )
}
