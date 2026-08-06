import { CalendarX } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/Avatar'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { useEvents } from '../hooks/useEvents'
import { currentUser } from '../services/mockData'

export function ProfilePage() {
  const { events, status } = useEvents()

  const createdEvents = events.filter(
    (event) => event.creatorId === currentUser.id,
  )
  const joinedEvents = events.filter((event) =>
    event.participantIds.includes(currentUser.id),
  )

  return (
    <div className="flex flex-col">
      <PageHeader title="Профіль" />

      <div className="flex flex-col gap-6 px-4 py-4">
        <div className="flex items-center gap-4">
          <Avatar name={currentUser.name} size={56} />
          <div>
            <p className="text-lg font-semibold text-neutral-900">
              {currentUser.name}
            </p>
            <p className="text-sm text-neutral-500">@{currentUser.username}</p>
          </div>
        </div>

        {status === 'loading' ? (
          <LoadingState label="Завантажуємо профіль…" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Створено подій" value={createdEvents.length} />
              <StatCard label="Беру участь" value={joinedEvents.length} />
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-neutral-900">
                Мої створені події
              </h2>
              {createdEvents.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="Ви ще не створювали подій"
                />
              ) : (
                createdEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-neutral-900">
                Події, у яких беру участь
              </h2>
              {joinedEvents.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="Ви ще не берете участі в подіях"
                />
              ) : (
                joinedEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
      <p className="text-2xl font-semibold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  )
}
