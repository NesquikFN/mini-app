import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useDormitories } from '../../hooks/useDormitories'
import {
  fetchAdminHosts,
  addHostByTelegramId,
  removeHost,
  getErrorMessage,
} from '../../services/api'
import type { HostListItem } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminHostsPage() {
  const { getDormitoryName } = useDormitories()
  const [hosts, setHosts] = useState<HostListItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [telegramIdInput, setTelegramIdInput] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [pendingRemoval, setPendingRemoval] = useState<HostListItem | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const runFetch = useCallback(() => {
    fetchAdminHosts()
      .then((data) => {
        setHosts(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    const trimmed = telegramIdInput.trim()
    const telegramId = Number(trimmed)
    if (!trimmed || !Number.isInteger(telegramId) || telegramId <= 0) {
      setAddError('Введіть коректний Telegram ID')
      return
    }

    setAdding(true)
    setAddError(null)
    try {
      const host = await addHostByTelegramId(telegramId)
      // Upsert-семантика на backend: якщо цей хост уже був у списку,
      // не дублюємо рядок, а лишаємо як є.
      setHosts((prev) => (prev.some((h) => h.id === host.id) ? prev : [...prev, host]))
      setTelegramIdInput('')
    } catch (error) {
      setAddError(getErrorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  async function handleConfirmRemove() {
    if (!pendingRemoval) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeHost(pendingRemoval.id)
      setHosts((prev) => prev.filter((h) => h.id !== pendingRemoval.id))
      setPendingRemoval(null)
    } catch (error) {
      setRemoveError(getErrorMessage(error))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Хости</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Хости можуть створювати, редагувати та видаляти шаблони подій у розділі «Ігри».
      </p>

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4"
      >
        <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="host-telegram-id">
          Додати хоста за Telegram ID
        </label>
        <div className="flex gap-2">
          <input
            id="host-telegram-id"
            type="text"
            inputMode="numeric"
            value={telegramIdInput}
            onChange={(event) => setTelegramIdInput(event.target.value)}
            placeholder="Наприклад, 939697036"
            className="h-11 flex-1 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)]"
          />
          <Button type="submit" loading={adding} disabled={adding}>
            <UserPlus size={16} /> Додати
          </Button>
        </div>
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </form>

      {status === 'loading' && <LoadingState label="Завантажуємо хостів…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити хостів"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && hosts.length === 0 && (
        <EmptyState title="Хостів не знайдено" />
      )}

      {status === 'success' && hosts.length > 0 && (
        <div className="flex flex-col gap-2">
          {hosts.map((host) => (
            <div
              key={host.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3"
            >
              <Avatar name={host.firstName} photoUrl={host.photoUrl} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {host.firstName}
                  {host.lastName ? ` ${host.lastName}` : ''}
                </p>
                {host.username && (
                  <p className="truncate text-xs text-[var(--text-secondary)]">@{host.username}</p>
                )}
                <p className="font-mono text-xs text-[var(--text-disabled)]">
                  telegram_id: {host.telegramId}
                </p>
                {getDormitoryName(host.dormitoryId) && (
                  <p className="text-xs text-[var(--text-disabled)]">{getDormitoryName(host.dormitoryId)}</p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setPendingRemoval(host)
                  setRemoveError(null)
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Забрати права хоста?"
          description={
            removeError ??
            `${pendingRemoval.firstName} більше не зможе редагувати шаблони подій.`
          }
          confirmLabel="Забрати права"
          loading={removing}
          onConfirm={handleConfirmRemove}
          onCancel={() => {
            setPendingRemoval(null)
            setRemoveError(null)
          }}
        />
      )}
    </div>
  )
}
