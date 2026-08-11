import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, Trash2, UserPlus } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { useDormitories } from '../../hooks/useDormitories'
import {
  addGpuByTelegramId,
  fetchAdminGpus,
  getErrorMessage,
  removeGpu,
} from '../../services/api'
import type { GpuListItem } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminGpusPage() {
  const { getDormitoryName } = useDormitories()
  const [gpus, setGpus] = useState<GpuListItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [telegramIdInput, setTelegramIdInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<GpuListItem | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchAdminGpus()
      .then((items) => {
        setGpus(items)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => load(), [load])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    const telegramId = Number(telegramIdInput.trim())
    if (!Number.isInteger(telegramId) || telegramId <= 0) {
      setAddError('Введіть коректний Telegram ID')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const gpu = await addGpuByTelegramId(telegramId)
      setGpus((items) => items.some((item) => item.id === gpu.id) ? items : [...items, gpu])
      setTelegramIdInput('')
    } catch (error) {
      setAddError(getErrorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove() {
    if (!pendingRemoval) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeGpu(pendingRemoval.id)
      setGpus((items) => items.filter((item) => item.id !== pendingRemoval.id))
      setPendingRemoval(null)
    } catch (error) {
      setRemoveError(getErrorMessage(error))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
        <BadgeCheck size={20} className="text-blue-400" /> ГПУ
      </h1>
      <p className="text-sm text-[var(--text-secondary)]">
        ГПУ можуть створювати й бачити приховані події. Звичайні користувачі не бачать цю роль.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <label htmlFor="gpu-telegram-id" className="text-sm font-medium text-[var(--text-primary)]">
          Додати ГПУ за Telegram ID
        </label>
        <div className="flex gap-2">
          <input
            id="gpu-telegram-id"
            inputMode="numeric"
            value={telegramIdInput}
            onChange={(event) => setTelegramIdInput(event.target.value)}
            placeholder="Telegram ID"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <Button type="submit" loading={adding}><UserPlus size={16} /> Додати</Button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </form>

      {status === 'loading' && <LoadingState label="Завантажуємо ГПУ…" />}
      {status === 'error' && <EmptyState title="Не вдалося завантажити ГПУ" description={errorMessage ?? undefined} actionLabel="Повторити" onAction={load} />}
      {status === 'success' && gpus.length === 0 && <EmptyState title="Користувачів з роллю ГПУ немає" />}
      {status === 'success' && gpus.length > 0 && (
        <div className="flex flex-col gap-2">
          {gpus.map((gpu) => (
            <div key={gpu.id} className="flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-[var(--surface-card)] p-3">
              <Avatar name={gpu.firstName} photoUrl={gpu.photoUrl} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {gpu.firstName}{gpu.lastName ? ` ${gpu.lastName}` : ''}
                </p>
                {gpu.username && <p className="truncate text-xs text-[var(--text-secondary)]">@{gpu.username}</p>}
                <p className="font-mono text-xs text-[var(--text-disabled)]">telegram_id: {gpu.telegramId}</p>
                {getDormitoryName(gpu.dormitoryId) && <p className="text-xs text-[var(--text-disabled)]">{getDormitoryName(gpu.dormitoryId)}</p>}
              </div>
              <Button variant="outline" onClick={() => setPendingRemoval(gpu)}><Trash2 size={16} /></Button>
            </div>
          ))}
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Забрати роль ГПУ?"
          description={removeError ?? `${pendingRemoval.firstName} більше не бачитиме ГПУ-події.`}
          confirmLabel="Забрати роль"
          loading={removing}
          onConfirm={handleRemove}
          onCancel={() => { setPendingRemoval(null); setRemoveError(null) }}
        />
      )}
    </div>
  )
}
