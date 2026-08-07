import { Loader2 } from 'lucide-react'

export function LoadingState({ label = 'Завантаження…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-[var(--text-secondary)]">
      <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
