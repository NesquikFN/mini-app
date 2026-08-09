import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Crown, Trash2, UserPlus } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { useDormitories } from '../../hooks/useDormitories'
import {
  addVipByTelegramId,
  fetchAdminVips,
  getErrorMessage,
  removeVip,
} from '../../services/api'
import type { VipListItem } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminVipsPage() {
  const { getDormitoryName } = useDormitories()
  const [vips, setVips] = useState<VipListItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [telegramIdInput, setTelegramIdInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<VipListItem | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchAdminVips()
      .then((items) => {
        setVips(items)
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
      const vip = await addVipByTelegramId(telegramId)
      setVips((items) => items.some((item) => item.id === vip.id) ? items : [...items, vip])
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
      await removeVip(pendingRemoval.id)
      setVips((items) => items.filter((item) => item.id !== pendingRemoval.id))
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
        <Crown size={20} className="text-amber-400" /> VIP
      </h1>
      <p className="text-sm text-[var(--text-secondary)]">
        VIP можуть створювати й бачити приховані події. Звичайні користувачі не бачать цю роль.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <label htmlFor="vip-telegram-id" className="text-sm font-medium text-[var(--text-primary)]">
          Додати VIP за Telegram ID
        </label>
        <div className="flex gap-2">
          <input
            id="vip-telegram-id"
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

      {status === 'loading' && <LoadingState label="Завантажуємо VIP…" />}
      {status === 'error' && <EmptyState title="Не вдалося завантажити VIP" description={errorMessage ?? undefined} actionLabel="Повторити" onAction={load} />}
      {status === 'success' && vips.length === 0 && <EmptyState title="VIP-користувачів немає" />}
      {status === 'success' && vips.length > 0 && (
        <div className="flex flex-col gap-2">
          {vips.map((vip) => (
            <div key={vip.id} className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-[var(--surface-card)] p-3">
              <Avatar name={vip.firstName} photoUrl={vip.photoUrl} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {vip.firstName}{vip.lastName ? ` ${vip.lastName}` : ''}
                </p>
                {vip.username && <p className="truncate text-xs text-[var(--text-secondary)]">@{vip.username}</p>}
                <p className="font-mono text-xs text-[var(--text-disabled)]">telegram_id: {vip.telegramId}</p>
                {getDormitoryName(vip.dormitoryId) && <p className="text-xs text-[var(--text-disabled)]">{getDormitoryName(vip.dormitoryId)}</p>}
              </div>
              <Button variant="outline" onClick={() => setPendingRemoval(vip)}><Trash2 size={16} /></Button>
            </div>
          ))}
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Забрати VIP-роль?"
          description={removeError ?? `${pendingRemoval.firstName} більше не бачитиме VIP-події.`}
          confirmLabel="Забрати роль"
          loading={removing}
          onConfirm={handleRemove}
          onCancel={() => { setPendingRemoval(null); setRemoveError(null) }}
        />
      )}
    </div>
  )
}
