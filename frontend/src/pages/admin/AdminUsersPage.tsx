import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { SearchInput } from '../../components/SearchInput'
import { PaginationControls } from '../../components/PaginationControls'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { fetchAdminUsers, getErrorMessage } from '../../services/api'
import { pluralizeEvents } from '../../utils/pluralize'
import type { AdminUsersResponse } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'
const LIMIT = 20
const SEARCH_DEBOUNCE_MS = 300

export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminUsersResponse | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const runFetch = useCallback(() => {
    fetchAdminUsers(page, LIMIT, debouncedSearch || undefined)
      .then((res) => {
        setData(res)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [page, debouncedSearch])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Користувачі</h1>
      <SearchInput value={search} onChange={setSearch} placeholder="Ім'я, username або telegram_id" />

      {status === 'loading' && <LoadingState label="Завантажуємо користувачів…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити користувачів"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && data && data.users.length === 0 && (
        <EmptyState title="Нікого не знайдено" description="Спробуйте інший запит." />
      )}

      {status === 'success' && data && data.users.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {data.users.map((user) => (
              <Link
                key={user.id}
                to={`/admin/users/${user.id}`}
                className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 active:bg-[var(--surface-bg)]"
              >
                <Avatar name={user.firstName} photoUrl={user.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {user.firstName}
                      {user.lastName ? ` ${user.lastName}` : ''}
                    </p>
                    {(user.bannedPermanently ||
                      (user.bannedUntil && new Date(user.bannedUntil).getTime() > now)) && (
                      <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                        У ЧС
                      </span>
                    )}
                  </div>
                  {user.username && (
                    <p className="truncate text-xs text-[var(--text-secondary)]">@{user.username}</p>
                  )}
                  <p className="text-xs text-[var(--text-disabled)]">
                    {user.eventsCreatedCount} {pluralizeEvents(user.eventsCreatedCount)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <PaginationControls pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
