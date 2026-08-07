import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Button } from './Button'
import type { BanDuration } from '../services/api'

export function BanUserDialog({
  userName,
  loading,
  error,
  onBan,
  onCancel,
}: {
  userName: string
  loading: boolean
  error?: string
  onBan: (duration: BanDuration, until?: string) => void
  onCancel: () => void
}) {
  const [customUntil, setCustomUntil] = useState('')
  const [minimum] = useState(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Додати {userName} до чорного списку?
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Користувач одразу втратить доступ до бота, включно з уже відкритою сесією.
        </p>

        <div className="mt-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] p-3">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <CalendarClock size={17} className="text-[var(--accent)]" />
            Точна дата й час
          </label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              min={minimum}
              value={customUntil}
              onChange={(event) => setCustomUntil(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-[var(--surface-border)] bg-black px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
            <Button
              variant="outline"
              disabled={!customUntil || loading}
              onClick={() => onBan('custom', new Date(customUntil).toISOString())}
            >
              Застосувати
            </Button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button variant="outline" disabled={loading} onClick={onCancel}>
            Скасувати
          </Button>
          <Button variant="secondary" disabled={loading} onClick={() => onBan('week')}>
            1 тиждень
          </Button>
          <Button variant="danger" loading={loading} onClick={() => onBan('forever')}>
            Назавжди
          </Button>
        </div>
      </div>
    </div>
  )
}
