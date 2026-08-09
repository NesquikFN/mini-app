import { useState } from 'react'
import { Archive, ChevronDown } from 'lucide-react'
import type { DormEvent } from '../types/event'
import { EventCard } from './EventCard'

interface ArchivedEventsSectionProps {
  events: DormEvent[]
  title?: string
}

export function ArchivedEventsSection({
  events,
  title = 'Архів подій',
}: ArchivedEventsSectionProps) {
  const [expanded, setExpanded] = useState(false)

  if (events.length === 0) return null

  const sortedEvents = [...events].sort((a, b) =>
    (b.date + b.time).localeCompare(a.date + a.time),
  )

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3 text-left active:bg-[var(--surface-card-alt)]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-card-alt)] text-[var(--accent)]">
          <Archive size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="block text-xs text-[var(--text-secondary)]">
            {events.length} завершених
          </span>
        </span>
        <ChevronDown
          size={20}
          className={`shrink-0 text-[var(--text-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3">
          {sortedEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </section>
  )
}
