import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cake, CalendarX, Home, Pencil, Settings } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/Avatar'
import { EventCard } from '../components/EventCard'
import { ArchivedEventsSection } from '../components/ArchivedEventsSection'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { InstagramIcon } from '../components/InstagramIcon'
import { RoleBadges } from '../components/RoleBadges'
import { isEventPast } from '../utils/date'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useAdminStatus } from '../hooks/useAdminStatus'
import { useDormitories } from '../hooks/useDormitories'
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
  const { status: adminStatus } = useAdminStatus()
  const { getDormitoryName } = useDormitories()
  const location = useLocation()
  const profileSaved = Boolean((location.state as { profileSaved?: boolean } | null)?.profileSaved)

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
  const activeCreatedEvents = myEvents?.created.filter(
    (event) => !isEventPast(event.date, event.time),
  ) ?? []
  const activeParticipatingEvents = myEvents?.participating.filter(
    (event) => !isEventPast(event.date, event.time),
  ) ?? []
  const archivedEvents = myEvents
    ? [...new Map(
        [...myEvents.created, ...myEvents.participating]
          .filter((event) => isEventPast(event.date, event.time))
          .map((event) => [event.id, event]),
      ).values()]
    : []

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
            {profileSaved && (
              <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                Профіль збережено.
              </p>
            )}
            <div className="flex items-center gap-4">
              <Avatar name={user.nickname ?? user.firstName} photoUrl={user.photoUrl} size={56} />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {user.nickname ?? user.firstName}
                </p>
                <div className="mt-1">
                  <RoleBadges isAdmin={user.isAdmin} isHost={user.isHost} isVip={user.isVip} isGpu={user.isGpu} />
                </div>
                {user.username && (
                  <p className="text-sm text-[var(--text-secondary)]">@{user.username}</p>
                )}
                <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                  <Home size={14} />{' '}
                  {getDormitoryName(user.dormitoryId) || 'Гуртожиток не вказано'}
                </p>
              </div>
              <Link
                to="/profile/edit"
                aria-label="Редагувати профіль"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] text-[var(--accent)] active:scale-95"
              >
                <Pencil size={18} />
              </Link>
            </div>

            {(user.instagram || user.age || user.bio) && (
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
                <div className="flex flex-wrap gap-2">
                  {user.instagram && (
                    <a
                      href={`https://instagram.com/${user.instagram}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft-bg)] px-3 py-1.5 text-sm font-medium text-[var(--accent)]"
                    >
                      <InstagramIcon size={16} /> {user.instagram}
                    </a>
                  )}
                  {user.age && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-card-alt)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                      <Cake size={15} /> Вік: {user.age}
                    </span>
                  )}
                </div>
                {user.bio && <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{user.bio}</p>}
              </div>
            )}

            {adminStatus === 'admin' && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-transform active:scale-[0.98] active:bg-[var(--surface-card-alt)]"
              >
                <Settings size={18} className="text-[var(--accent)]" />
                Адмін-панель
              </Link>
            )}

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
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Мої створені події
              </h2>
              {activeCreatedEvents.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="Немає активних створених подій"
                />
              ) : (
                activeCreatedEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Події, у яких беру участь
              </h2>
              {activeParticipatingEvents.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="Немає активних подій з вашою участю"
                />
              ) : (
                activeParticipatingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </section>

            <ArchivedEventsSection events={archivedEvents} />
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 text-center">
      <p className="text-2xl font-semibold text-[var(--accent)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}
