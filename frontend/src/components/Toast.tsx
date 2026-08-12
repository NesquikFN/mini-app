import { useEffect } from 'react'
import { Check } from 'lucide-react'

interface ToastProps {
  message: string
  /** Скільки тримати на екрані. */
  durationMs?: number
  onDismiss: () => void
}

/**
 * Коротке підтвердження внизу екрана — замість window.alert(), який не
 * стилізується під DormHub і в Telegram WebView виглядає системним
 * діалогом посеред Mini App.
 *
 * Сідає над BottomNavigation і враховує safe-area iPhone, щоб не
 * ховатись під домашньою рискою.
 */
export function Toast({ message, durationMs = 3500, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [durationMs, onDismiss])

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 animate-[dormhub-slide-up_0.2s_ease]"
    >
      <div className="flex max-w-[min(100%,24rem)] items-center gap-2.5 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-black">
          <Check size={15} strokeWidth={3} />
        </span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{message}</span>
      </div>
    </div>
  )
}
