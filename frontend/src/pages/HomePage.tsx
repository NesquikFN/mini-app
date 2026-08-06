import { Link } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { isPastDate } from '../utils/date'

const DORM_NAME = 'Гуртожиток №5'

export function HomePage() {
  const { events, status, reload } = useEvents()

  const upcoming = [...events]
    .filter((event) => !isPastDate(event.date))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 3)

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <div>
        <p className="text-xl font-semibold text-neutral-900">👋 Привіт!</p>
        <p className="mt-1 text-sm text-neutral-500">{DORM_NAME}</p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">
            Найближчі події
          </h2>
          <Link to="/events" className="text-sm font-medium text-violet-600">
            Переглянути всі
          </Link>
        </div>

        {status === 'loading' && <LoadingState label="Завантажуємо події…" />}

        {status === 'error' && (
          <EmptyState
            icon={<CalendarX size={40} />}
            title="Не вдалося завантажити події"
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
      </section>
    </div>
  )
}
