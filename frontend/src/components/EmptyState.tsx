import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-[var(--text-disabled)]">{icon}</div>}
      <p className="text-base font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="text-sm text-[var(--text-secondary)]">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
