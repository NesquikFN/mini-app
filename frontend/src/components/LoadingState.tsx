import { Loader2 } from 'lucide-react'

export function LoadingState({ label = 'Завантаження…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-neutral-400">
      <Loader2 size={28} className="animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
