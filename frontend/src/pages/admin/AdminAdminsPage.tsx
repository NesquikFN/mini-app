import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useDormitories } from '../../hooks/useDormitories'
import {
  fetchAdminAdmins,
  addAdminByTelegramId,
  removeAdmin,
  getErrorMessage,
} from '../../services/api'
import type { AdminListItem } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminAdminsPage() {
  const { getDormitoryName } = useDormitories()
  const [admins, setAdmins] = useState<AdminListItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [telegramIdInput, setTelegramIdInput] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [pendingRemoval, setPendingRemoval] = useState<AdminListItem | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const runFetch = useCallback(() => {
    fetchAdminAdmins()
      .then((data) => {
        setAdmins(data)
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
      const admin = await addAdminByTelegramId(telegramId)
      // Upsert-семантика на backend: якщо цей адмін уже був у списку,
      // не дублюємо рядок, а лишаємо як є.
      setAdmins((prev) => (prev.some((a) => a.id === admin.id) ? prev : [...prev, admin]))
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
      await removeAdmin(pendingRemoval.id)
      setAdmins((prev) => prev.filter((a) => a.id !== pendingRemoval.id))
      setPendingRemoval(null)
    } catch (error) {
      // Найімовірніше LAST_ADMIN_CANNOT_BE_REMOVED — показуємо прямо в
      // діалозі замість того, щоб мовчки його закрити.
      setRemoveError(getErrorMessage(error))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Адміністратори</h1>

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4"
      >
        <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="admin-telegram-id">
          Додати адміністратора за Telegram ID
        </label>
        <div className="flex gap-2">
          <input
            id="admin-telegram-id"
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

      {status === 'loading' && <LoadingState label="Завантажуємо адміністраторів…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити адміністраторів"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && admins.length === 0 && (
        <EmptyState title="Адміністраторів не знайдено" />
      )}

      {status === 'success' && admins.length > 0 && (
        <div className="flex flex-col gap-2">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3"
            >
              <Avatar name={admin.firstName} photoUrl={admin.photoUrl} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {admin.firstName}
                  {admin.lastName ? ` ${admin.lastName}` : ''}
                </p>
                {admin.username && (
                  <p className="truncate text-xs text-[var(--text-secondary)]">@{admin.username}</p>
                )}
                <p className="font-mono text-xs text-[var(--text-disabled)]">
                  telegram_id: {admin.telegramId}
                </p>
                {getDormitoryName(admin.dormitoryId) && (
                  <p className="text-xs text-[var(--text-disabled)]">{getDormitoryName(admin.dormitoryId)}</p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setPendingRemoval(admin)
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
          title="Забрати права адміністратора?"
          description={
            removeError ??
            `${pendingRemoval.firstName} більше не матиме доступу до адмін-панелі.`
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
