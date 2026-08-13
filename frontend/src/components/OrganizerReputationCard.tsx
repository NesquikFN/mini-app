import { Star, Users } from 'lucide-react'
import { EVENT_RATING_TAG_LABELS, type OrganizerReputation } from '../types/eventRating'
import { pluralizeEvents, pluralizeRatings } from '../utils/pluralize'

/**
 * Блок «Репутація організатора» на публічному профілі. Рендериться лише
 * коли людина справді проводила завершені події — інакше «Проведено 0
 * подій» лише займало б місце без користі.
 *
 * Свідомо НЕ "Прийшло людей": участь у завершеній події — це
 * реєстрація, а не підтверджена присутність (немає QR/check-in).
 */
export function OrganizerReputationCard({ reputation }: { reputation: OrganizerReputation }) {
  if (reputation.completedEventsCount === 0) return null

  return (
    <section className="flex flex-col gap-2.5 rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
        <Star size={18} className="text-[var(--accent)]" /> Репутація організатора
      </h2>

      {reputation.averageRating !== undefined ? (
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[var(--text-primary)]">
            {reputation.averageRating.toFixed(1).replace('.', ',')}
          </span>
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            · {reputation.ratingsCount} {pluralizeRatings(reputation.ratingsCount)}
          </span>
        </p>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Ще недостатньо оцінок</p>
      )}

      <p className="text-sm text-[var(--text-secondary)]">
        Проведено {reputation.completedEventsCount} {pluralizeEvents(reputation.completedEventsCount)}
      </p>

      <p className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Users size={14} className="shrink-0" />
        Учасників у проведених подіях: {reputation.totalParticipantsInCompletedEvents}
      </p>

      {reputation.topTags.length > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          Найчастіше відзначають:{' '}
          {reputation.topTags.map((tag) => EVENT_RATING_TAG_LABELS[tag].toLowerCase()).join(', ')}
        </p>
      )}
    </section>
  )
}
