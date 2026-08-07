import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldOff, UserRoundCheck } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import {
  fetchBannedUsers,
  getErrorMessage,
  unbanAdminUser,
} from '../../services/api'
import type { AdminUserView } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

export function AdminBannedUsersPage() {
  const [users, setUsers] = useState<AdminUserView[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchBannedUsers()
      .then((data) => {
        setUsers(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => runFetch(), [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  async function handleUnban(user: AdminUserView) {
    setPendingId(user.id)
    setErrorMessage(null)
    try {
      await unbanAdminUser(user.id)
      setUsers((current) => current.filter((item) => item.id !== user.id))
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Чорний список</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Користувачі, яким зараз заборонено користуватися DormHub.
        </p>
      </div>

      {errorMessage && status !== 'error' && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorMessage}</p>
      )}

      {status === 'loading' && <LoadingState label="Завантажуємо чорний список…" />}
      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити чорний список"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}
      {status === 'success' && users.length === 0 && (
        <EmptyState
          icon={<ShieldOff size={32} />}
          title="Чорний список порожній"
          description="Заблокованих користувачів немає."
        />
      )}
      {status === 'success' && users.length > 0 && (
        <div className="flex flex-col gap-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/20 bg-[var(--surface-card)] p-3"
            >
              <Link to={`/admin/users/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={user.firstName} photoUrl={user.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {user.firstName}{user.lastName ? ` ${user.lastName}` : ''}
                  </p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {user.bannedPermanently
                      ? 'Заблоковано назавжди'
                      : `До ${new Date(user.bannedUntil!).toLocaleString('uk-UA')}`}
                  </p>
                </div>
              </Link>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                loading={pendingId === user.id}
                disabled={pendingId !== null}
                onClick={() => handleUnban(user)}
              >
                <UserRoundCheck size={16} /> Розбанити
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
