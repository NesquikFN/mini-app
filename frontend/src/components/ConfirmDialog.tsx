import { Button } from './Button'

interface ConfirmDialogProps {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Власна модалка підтвердження замість window.confirm() — той не
 * стилізується під DormHub і його не завжди можна надійно підтвердити
 * програмно (нативні діалоги браузера). */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Видалити',
  cancelLabel = 'Скасувати',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 animate-[dormhub-fade-in_0.15s_ease]"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5 animate-[dormhub-slide-up_0.2s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-base font-semibold text-[var(--text-primary)]">{title}</p>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="outline" fullWidth onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="danger" fullWidth onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
