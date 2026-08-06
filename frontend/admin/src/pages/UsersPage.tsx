import { useEffect, useMemo, useState } from 'react'
import { SearchInput } from '../components/SearchInput'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { fetchUsers, getErrorMessage } from '../services/api'
import { formatDateTime } from '../utils/date'
import type { AdminUserView } from '../types/user'

type Status = 'loading' | 'success' | 'error'

export function UsersPage() {
  const [users, setUsers] = useState<AdminUserView[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchUsers()
      .then((data) => {
        setUsers(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) => {
      const fullName = `${user.firstName} ${user.lastName ?? ''}`.toLowerCase()
      return (
        fullName.includes(query) ||
        (user.username ?? '').toLowerCase().includes(query) ||
        String(user.telegramId).includes(query)
      )
    })
  }, [users, search])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Користувачі</h1>
        <SearchInput value={search} onChange={setSearch} placeholder="Ім'я, username або telegram_id" />
      </div>

      {status === 'loading' && <LoadingState label="Завантажуємо користувачів…" />}

      {status === 'error' && (
        <EmptyState title="Не вдалося завантажити користувачів" description={errorMessage ?? undefined} />
      )}

      {status === 'success' && filtered.length === 0 && (
        <EmptyState title="Нічого не знайдено" description="Спробуйте інший запит." />
      )}

      {status === 'success' && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Ім'я</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Telegram ID</th>
                <th className="px-4 py-3 font-medium">Дата реєстрації</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((user) => (
                <tr key={user.id} className="text-neutral-800">
                  <td className="px-4 py-3 font-medium">
                    {user.firstName} {user.lastName ?? ''}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {user.username ? `@${user.username}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-500">{user.telegramId}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
