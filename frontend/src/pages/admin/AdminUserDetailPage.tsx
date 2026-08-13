import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, CalendarX, ShieldCheck, Star, Trash2, UserRoundCheck } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { EventCard } from '../../components/EventCard'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BanUserDialog } from '../../components/BanUserDialog'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useTelegramBackButton } from '../../hooks/useTelegramBackButton'
import {
  banAdminUser,
  deleteAdminUser,
  fetchAdminUserDetail,
  getErrorMessage,
  unbanAdminUser,
  type BanDuration,
} from '../../services/api'
import type { AdminOrganizerReputation, AdminUserDetail } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showBanDialog, setShowBanDialog] = useState(false)
  const [banLoading, setBanLoading] = useState(false)
  const [banError, setBanError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const runFetch = useCallback(() => {
    if (!id) return
    fetchAdminUserDetail(id)
      .then((data) => {
        setDetail(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [id])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  useTelegramBackButton(true, () => navigate('/admin/users'))

  if (!id) return null

  if (status === 'loading') {
    return <LoadingState label="Завантажуємо користувача…" />
  }

  if (status === 'error' || !detail) {
    return (
      <EmptyState
        title="Не вдалося завантажити користувача"
        description={errorMessage ?? undefined}
        actionLabel="Спробувати ще раз"
        onAction={retry}
      />
    )
  }

  const { user, stats, createdEvents, participatingEvents, organizerReputation } = detail
  const isBanned =
    user.bannedPermanently ||
    (user.bannedUntil ? new Date(user.bannedUntil).getTime() > now : false)

  async function handleDeleteUser() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAdminUser(user.id)
      navigate('/admin/users')
    } catch (error) {
      setDeleteError(getErrorMessage(error))
      setDeleting(false)
    }
  }

  async function handleBan(duration: BanDuration, until?: string) {
    setBanLoading(true)
    setBanError(null)
    try {
      await banAdminUser(user.id, duration, until)
      setShowBanDialog(false)
      navigate('/admin/banned')
    } catch (error) {
      setBanError(getErrorMessage(error))
    } finally {
      setBanLoading(false)
    }
  }

  async function handleUnban() {
    setBanLoading(true)
    setBanError(null)
    try {
      await unbanAdminUser(user.id)
      retry()
    } catch (error) {
      setBanError(getErrorMessage(error))
    } finally {
      setBanLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <Avatar name={user.firstName} photoUrl={user.photoUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-[var(--text-primary)]">
            {user.firstName}
            {user.lastName ? ` ${user.lastName}` : ''}
          </p>
          {user.username && <p className="text-sm text-[var(--text-secondary)]">@{user.username}</p>}
          <p className="font-mono text-xs text-[var(--text-disabled)]">telegram_id: {user.telegramId}</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {isBanned ? (
            <Button className="flex-1" variant="outline" loading={banLoading} onClick={handleUnban}>
              <UserRoundCheck size={17} /> Розбанити
            </Button>
          ) : (
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => {
                setBanError(null)
                setShowBanDialog(true)
              }}
            >
              <Ban size={17} /> У ЧС
            </Button>
          )}
          <Button
            variant="danger"
            aria-label="Видалити користувача"
            onClick={() => {
              setDeleteError(null)
              setConfirmingDelete(true)
            }}
          >
            <Trash2 size={17} />
          </Button>
        </div>
      </div>

      {isBanned && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {user.bannedPermanently
            ? 'Користувач заблокований назавжди.'
            : `Користувач заблокований до ${new Date(user.bannedUntil!).toLocaleString('uk-UA')}.`}
        </div>
      )}
      {banError && !showBanDialog && <p className="text-sm text-red-400">{banError}</p>}

      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Створено подій" value={stats.createdEvents} />
        <StatBlock label="Бере участь" value={stats.participatingEvents} />
      </div>

      <OrganizerReputationSection reputation={organizerReputation} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Створені події</h2>
        {createdEvents.length === 0 ? (
          <EmptyState icon={<CalendarX size={28} />} title="Немає створених подій" />
        ) : (
          createdEvents.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Бере участь у подіях</h2>
        {participatingEvents.length === 0 ? (
          <EmptyState icon={<CalendarX size={28} />} title="Не бере участі в подіях" />
        ) : (
          participatingEvents.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </section>

      {confirmingDelete && (
        <ConfirmDialog
          title="Видалити користувача?"
          description={
            deleteError ??
            `${user.firstName} буде видалений назавжди разом зі створеними подіями та участями.`
          }
          confirmLabel="Видалити користувача"
          loading={deleting}
          onConfirm={handleDeleteUser}
          onCancel={() => {
            setConfirmingDelete(false)
            setDeleteError(null)
          }}
        />
      )}

      {showBanDialog && (
        <BanUserDialog
          userName={user.firstName}
          loading={banLoading}
          error={banError ?? undefined}
          onBan={handleBan}
          onCancel={() => {
            if (banLoading) return
            setShowBanDialog(false)
            setBanError(null)
          }}
        />
      )}
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 text-center">
      <p className="text-xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

/** На відміну від публічного профілю, тут середню оцінку показуємо
 * завжди (коли є хоч одна) — адміну потрібна повна картина, а не
 * версія, приховану через MIN_RATINGS_FOR_PUBLIC_AVERAGE. */
function OrganizerReputationSection({ reputation }: { reputation: AdminOrganizerReputation }) {
  const maxCount = Math.max(1, ...reputation.distribution)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Star size={16} className="text-[var(--accent)]" /> Репутація організатора
        </h2>
        {reputation.isReliableOrganizer ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <ShieldCheck size={13} /> Надійний
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-card-alt)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
            Ще не кваліфікується
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBlock
          label="Середня оцінка"
          value={reputation.averageRating ?? 0}
        />
        <StatBlock label="Оцінок" value={reputation.ratingsCount} />
        <StatBlock label="Завершених подій" value={reputation.completedEventsCount} />
      </div>

      {reputation.ratingsCount > 0 && (
        <div className="flex flex-col gap-1.5">
          {reputation.distribution.map((count, index) => {
            const value = index + 1
            return (
              <div key={value} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="w-3 shrink-0 text-right font-semibold">{value}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-card-alt)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
