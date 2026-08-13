import { ShieldCheck } from 'lucide-react'

/** Автоматичний бейдж — рахується на бекенді з актуальних даних
 * (щонайменше 3 завершені події, 10 оцінок, середня ≥ 4,3, організатор
 * не заблокований), ніде не зберігається вручну. Той самий компонент
 * використовується в RoleBadges (профіль), EventDetailPage (біля
 * організатора) і EventCard (компактно). */
export function ReliableOrganizerBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 font-semibold text-emerald-400 ${
        compact ? 'px-2 py-1 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
    >
      <ShieldCheck size={compact ? 11 : 13} /> Надійний організатор
    </span>
  )
}
