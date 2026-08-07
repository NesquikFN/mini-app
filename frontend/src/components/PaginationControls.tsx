import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Pagination } from '../types/admin'

interface PaginationControlsProps {
  pagination: Pagination
  onPageChange: (page: number) => void
}

export function PaginationControls({ pagination, onPageChange }: PaginationControlsProps) {
  const { page, pages, total } = pagination
  if (pages <= 1) return null

  return (
    <div className="flex items-center justify-between pt-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Попередня сторінка"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] disabled:opacity-30 active:bg-[var(--surface-card-alt)]"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-xs text-[var(--text-secondary)]">
        Сторінка {page} з {pages} · Усього {total}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Наступна сторінка"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] disabled:opacity-30 active:bg-[var(--surface-card-alt)]"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
