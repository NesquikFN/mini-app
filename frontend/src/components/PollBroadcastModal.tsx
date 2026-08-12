import { useEffect, useState } from 'react'
import { Button } from './Button'
import { broadcastAdminPoll, fetchPollAudienceCount, getErrorMessage } from '../services/api'
import {
  POLL_AUDIENCE_LABELS,
  type AdminPoll,
  type PollAudience,
  type PollBroadcastReport,
} from '../types/poll'

interface PollBroadcastModalProps {
  poll: AdminPoll
  onClose: () => void
  onSent: (report: PollBroadcastReport, meta: { at: string; audience: PollAudience }) => void
}

type Step = 'select' | 'confirm' | 'result'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Двоетапне підтвердження масової розсилки: вибір аудиторії з приблизною
 * кількістю отримувачів → окремий екран "Надіслати опитування в особисті
 * повідомлення?" з деталями й попередженням про незворотність. Розсилка
 * стартує лише з другого екрана, ніколи з першого натискання.
 */
export function PollBroadcastModal({ poll, onClose, onSent }: PollBroadcastModalProps) {
  // За замовчуванням — безпечніший варіант (менша аудиторія).
  const [audience, setAudience] = useState<PollAudience>('subscribers')
  // null, поки перший запит для поточної аудиторії ще не повернувся —
  // при зміні аудиторії значення попередньої лишається видимим ще
  // мить, замість показу проміжного "завантаження" (без синхронного
  // setState у тілі ефекту).
  const [count, setCount] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('select')
  const [resendAck, setResendAck] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<PollBroadcastReport | null>(null)

  const alreadyBroadcast = Boolean(poll.lastBroadcastAt)

  useEffect(() => {
    let cancelled = false
    fetchPollAudienceCount(poll.id, audience)
      .then((value) => {
        if (!cancelled) setCount(value)
      })
      .catch(() => {
        if (!cancelled) setCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [poll.id, audience])

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const result = await broadcastAdminPoll(poll.id, audience, alreadyBroadcast ? resendAck : false)
      setReport(result)
      setStep('result')
      onSent(result, { at: new Date().toISOString(), audience })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 animate-[dormhub-fade-in_0.15s_ease]"
      onClick={step === 'result' ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5 animate-[dormhub-slide-up_0.2s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        {step === 'select' && (
          <>
            <p className="text-base font-semibold text-[var(--text-primary)]">Кому надіслати опитування?</p>

            <div className="mt-4 flex flex-col gap-2">
              {(['subscribers', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAudience(value)}
                  className={`rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
                    audience === value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent)]'
                      : 'border-[var(--surface-border)] text-[var(--text-primary)]'
                  }`}
                >
                  {POLL_AUDIENCE_LABELS[value]}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              Підписники — користувачі, які увімкнули особисті сповіщення в розділі «Ігри».
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Приблизна кількість отримувачів: {count ?? '…'}
            </p>

            {alreadyBroadcast && poll.lastBroadcastAt && (
              <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                Востаннє надіслано {formatDateTime(poll.lastBroadcastAt)}
                {poll.lastBroadcastAudience ? ` (${POLL_AUDIENCE_LABELS[poll.lastBroadcastAudience]})` : ''}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <Button variant="outline" fullWidth onClick={onClose}>
                Скасувати
              </Button>
              <Button fullWidth onClick={() => setStep('confirm')}>
                Далі
              </Button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <p className="text-base font-semibold text-[var(--text-primary)]">
              Надіслати опитування в особисті повідомлення?
            </p>

            <div className="mt-3 flex flex-col gap-1.5 text-sm text-[var(--text-secondary)]">
              <p>
                Аудиторія:{' '}
                <span className="font-medium text-[var(--text-primary)]">{POLL_AUDIENCE_LABELS[audience]}</span>
              </p>
              <p>
                Приблизно отримувачів:{' '}
                <span className="font-medium text-[var(--text-primary)]">{count ?? '—'}</span>
              </p>
              <p>
                Запитання: <span className="font-medium text-[var(--text-primary)]">{poll.question}</span>
              </p>
              <p>
                Варіантів:{' '}
                <span className="font-medium text-[var(--text-primary)]">{poll.options.length}</span>
              </p>
            </div>

            <p className="mt-3 text-xs font-medium text-red-400">Цю дію не можна скасувати.</p>

            {alreadyBroadcast && (
              <label className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={resendAck}
                  onChange={(event) => setResendAck(event.target.checked)}
                  className="mt-0.5"
                />
                Це опитування вже надсилалося раніше. Підтверджую повторну розсилку.
              </label>
            )}

            {error && (
              <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <Button variant="outline" fullWidth onClick={onClose} disabled={sending}>
                Скасувати
              </Button>
              <Button
                fullWidth
                onClick={handleSend}
                loading={sending}
                disabled={sending || (alreadyBroadcast && !resendAck)}
              >
                Надіслати
              </Button>
            </div>
          </>
        )}

        {step === 'result' && report && (
          <>
            <p className="text-base font-semibold text-[var(--text-primary)]">Розсилку завершено</p>
            <p className="mt-3 text-sm text-[var(--text-primary)]">
              Надіслано: {report.sent} із {report.targeted}
            </p>
            {report.failed > 0 && (
              <p className="mt-1 text-sm text-red-400">Не доставлено: {report.failed}</p>
            )}
            {report.skipped > 0 && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Пропущено (уже отримали раніше): {report.skipped}
              </p>
            )}
            <Button fullWidth className="mt-5" onClick={onClose}>
              Закрити
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
