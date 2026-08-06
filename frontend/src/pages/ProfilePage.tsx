import { useCallback, useEffect, useState } from 'react'
import { CalendarX } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/Avatar'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { useCurrentUser } from '../hooks/useCurrentUser'
import {
  fetchMyEvents,
  getErrorMessage,
  type MyEventsResponse,
} from '../services/api'

type LoadStatus = 'loading' | 'success' | 'error'

export function ProfilePage() {
  const {
    user,
    status: userStatus,
    errorMessage: userErrorMessage,
    reload: reloadUser,
  } = useCurrentUser()

  const [myEvents, setMyEvents] = useState<MyEventsResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchMyEvents()
      .then((data) => {
        setMyEvents(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })
  }, [])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const isLoading = userStatus === 'loading' || status === 'loading'
  const hasError = userStatus === 'error' || status === 'error'

  function handleRetry() {
    reloadUser()
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Профіль" />

      <div className="flex flex-col gap-6 px-4 py-4">
        {isLoading && <LoadingState label="Завантажуємо профіль…" />}

        {!isLoading && hasError && (
          <EmptyState
            icon={<CalendarX size={32} />}
            title="Не вдалося завантажити профіль"
            description={userErrorMessage ?? errorMessage ?? undefined}
            actionLabel="Спробувати ще раз"
            onAction={handleRetry}
          />
        )}

        {!isLoading && !hasError && user && myEvents && (
          <>
            <div className="flex items-center gap-4">
              <Avatar name={user.firstName} size={56} />
              <div>
                <p className="text-lg font-semibold text-neutral-900">
                  {user.firstName}
                </p>
                {user.username && (
                  <p className="text-sm text-neutral-500">@{user.username}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Створено подій"
                value={myEvents.created.length}
              />
              <StatCard
                label="Беру участь"
                value={myEvents.participating.length}
              />
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-neutral-900">
                Мої створені події
              </h2>
              {myEvents.created.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="Ви ще не створювали подій"
                />
              ) : (
                myEvents.created.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-neutral-900">
                Події, у яких беру участь
              </h2>
              {myEvents.participating.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="Ви ще не берете участі в подіях"
                />
              ) : (
                myEvents.participating.map((event) => (
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
