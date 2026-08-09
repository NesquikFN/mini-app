import { useCallback, useEffect, useState } from 'react'
import { Cake, CalendarX, Home, UserRoundX } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EventCard } from '../components/EventCard'
import { ArchivedEventsSection } from '../components/ArchivedEventsSection'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { InstagramIcon } from '../components/InstagramIcon'
import { isEventPast } from '../utils/date'
import { RoleBadges } from '../components/RoleBadges'
import { useDormitories } from '../hooks/useDormitories'
import {
  fetchPublicUser,
  getErrorMessage,
  type PublicProfileResponse,
} from '../services/api'

type LoadStatus = 'loading' | 'success' | 'error'

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { getDormitoryName } = useDormitories()
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadUser = useCallback(() => {
    if (!id) return
    fetchPublicUser(id)
      .then((data) => {
        setProfile(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })
  }, [id])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  function handleRetry() {
    setStatus('loading')
    setErrorMessage(null)
    loadUser()
  }

  const activeEvents = profile?.createdEvents.filter(
    (event) => !isEventPast(event.date, event.time),
  ) ?? []
  const archivedEvents = profile?.createdEvents.filter(
    (event) => isEventPast(event.date, event.time),
  ) ?? []

  return (
    <div className="flex flex-col">
      <PageHeader title="Профіль учасника" showBack />
      <div className="px-4 py-6">
        {status === 'loading' && <LoadingState label="Завантажуємо профіль…" />}
        {status === 'error' && (
          <EmptyState
            icon={<UserRoundX size={36} />}
            title="Не вдалося завантажити профіль"
            description={errorMessage ?? undefined}
            actionLabel="Спробувати ще раз"
            onAction={handleRetry}
          />
        )}
        {status === 'success' && profile && (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col items-center rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-8 text-center">
              <Avatar
                name={profile.user.nickname ?? profile.user.firstName}
                photoUrl={profile.user.photoUrl}
                size={88}
              />
              <h1 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {profile.user.nickname ?? profile.user.firstName}
              </h1>
              <div className="mt-1 flex items-center justify-center gap-2">
                {profile.user.username && (
                  <p className="text-sm text-[var(--text-secondary)]">
                    @{profile.user.username}
                  </p>
                )}
              </div>
              <div className="mt-2">
                <RoleBadges
                  isAdmin={profile.isAdmin}
                  isHost={profile.isHost}
                  isVip={profile.isVip}
                  centered
                />
              </div>
              <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                <Home size={16} />
                {getDormitoryName(profile.user.dormitoryId) || 'Гуртожиток не вказано'}
              </p>
              {(profile.user.instagram || profile.user.age) && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {profile.user.instagram && (
                    <a
                      href={`https://instagram.com/${profile.user.instagram}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft-bg)] px-3 py-1.5 text-sm font-medium text-[var(--accent)]"
                    >
                      <InstagramIcon size={16} /> {profile.user.instagram}
                    </a>
                  )}
                  {profile.user.age && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-card-alt)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                      <Cake size={15} /> Вік: {profile.user.age}
                    </span>
                  )}
                </div>
              )}
              {profile.user.bio && (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                  {profile.user.bio}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Створені події · {activeEvents.length}
              </h2>
              {activeEvents.length === 0 ? (
                <EmptyState
                  icon={<CalendarX size={32} />}
                  title="У користувача немає активних подій"
                />
              ) : (
                activeEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </section>

            <ArchivedEventsSection events={archivedEvents} />
          </div>
        )}
      </div>
    </div>
  )
}
