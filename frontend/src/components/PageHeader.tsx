import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTelegramBackButton } from '../hooks/useTelegramBackButton'

interface PageHeaderProps {
  title: string
  showBack?: boolean
}

export function PageHeader({ title, showBack = false }: PageHeaderProps) {
  const navigate = useNavigate()
  const goBack = () => navigate(-1)

  useTelegramBackButton(showBack, goBack)

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--surface-border)] bg-[var(--surface-bg)]/95 px-4 py-3 backdrop-blur">
      {showBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Назад"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-transform active:scale-90 active:bg-[var(--surface-card-alt)]"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h1>
    </header>
  )
}
