import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CalendarX, House, MonitorPlay } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { DormitorySelector } from '../components/DormitorySelector'
import { SocialLinks } from '../components/SocialLinks'
import { fetchAppSettings, type SocialLinks as SocialLinksType } from '../services/api'
import { isEventPast } from '../utils/date'
import { NO_DORMITORY_ID } from '../types/dormitory'

export function HomePage() {
  const { events, status, errorMessage, reload } = useEvents()
  const { user } = useCurrentUser()
  const [socialLinks, setSocialLinks] = useState<SocialLinksType>()

  useEffect(() => {
    fetchAppSettings()
      .then(setSocialLinks)
      .catch(() => setSocialLinks(undefined))
  }, [])

  // Backend повертає фізичні події свого гуртожитку плюс глобальні
  // онлайн-події. На головній розділяємо їх на окремі секції.
  const upcoming = [...events]
    .filter((event) => !event.isOnline && !isEventPast(event.date, event.time))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 3)
  const onlineEvents = [...events]
    .filter((event) => event.isOnline && !isEventPast(event.date, event.time))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 3)
  const onlineOnly = user?.dormitoryId === NO_DORMITORY_ID

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 pt-0.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
              <House size={21} />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold tracking-wide text-[var(--text-primary)]">
                DormHub
              </p>
              <p className="truncate text-[11px] text-[var(--text-secondary)]">
                Події · ігри · свої люди
              </p>
            </div>
          </div>
          <SocialLinks links={socialLinks} />
        </div>
        <DormitorySelector />
      </div>

      {!onlineOnly && <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <CalendarDays size={18} className="text-[var(--accent)]" /> Найближчі події
          </h2>
          <Link to="/events" className="text-sm font-medium text-[var(--accent)]">
            Переглянути всі
          </Link>
        </div>

        {status === 'loading' && <LoadingState label="Завантажуємо події…" />}

        {status === 'error' && (
          <EmptyState
            icon={<CalendarX size={40} />}
            title="Не вдалося завантажити події"
            description={errorMessage ?? undefined}
            actionLabel="Спробувати ще раз"
            onAction={reload}
          />
        )}

        {status === 'success' && upcoming.length === 0 && (
          <EmptyState
            icon={<CalendarX size={40} />}
            title="Поки що немає подій"
            description="Створи першу подію для свого гуртожитку."
          />
        )}

        {status === 'success' && upcoming.length > 0 && (
          <div className="flex flex-col gap-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>}

      <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <MonitorPlay size={18} className="text-[var(--accent)]" /> Онлайн-події
          </h2>
          <Link to="/events" className="text-sm font-medium text-[var(--accent)]">
            Переглянути всі
          </Link>
        </div>

        {status === 'success' && onlineEvents.length === 0 && (
          <EmptyState
            icon={<MonitorPlay size={36} />}
            title="Поки немає онлайн-подій"
            description="Вони доступні всім гуртожиткам."
          />
        )}

        {status === 'success' && onlineEvents.length > 0 && (
          <div className="flex flex-col gap-3">
            {onlineEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
