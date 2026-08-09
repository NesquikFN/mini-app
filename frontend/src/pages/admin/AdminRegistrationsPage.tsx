import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, UserRoundSearch } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { SearchInput } from '../../components/SearchInput'
import { PaginationControls } from '../../components/PaginationControls'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { fetchAdminRegistrations, getErrorMessage, type RegistrationStatusFilter } from '../../services/api'
import type { RegistrationsResponse } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'
const LIMIT = 20
const SEARCH_DEBOUNCE_MS = 300

const TABS: { value: RegistrationStatusFilter; label: string }[] = [
  { value: 'pending', label: 'На розгляді' },
  { value: 'approved', label: 'Схвалені' },
  { value: 'rejected', label: 'Відхилені' },
]

const STATUS_BADGE: Record<RegistrationStatusFilter, string> = {
  pending: 'bg-amber-500/15 text-amber-400',
  approved: 'bg-emerald-500/15 text-emerald-400',
  rejected: 'bg-red-500/15 text-red-400',
}

const STATUS_LABEL: Record<RegistrationStatusFilter, string> = {
  pending: 'На розгляді',
  approved: 'Схвалено',
  rejected: 'Відхилено',
}

export function AdminRegistrationsPage() {
  const [statusFilter, setStatusFilter] = useState<RegistrationStatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<RegistrationsResponse | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const runFetch = useCallback(() => {
    fetchAdminRegistrations(page, LIMIT, statusFilter, debouncedSearch || undefined)
      .then((res) => {
        setData(res)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [page, statusFilter, debouncedSearch])

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
      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Заявки на реєстрацію</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Перегляд і модерація заявок нових користувачів.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatusFilter(tab.value)
              setPage(1)
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-[var(--accent)] text-black'
                : 'border border-[var(--surface-border)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Ім'я, username або факультет" />

      {status === 'loading' && <LoadingState label="Завантажуємо заявки…" />}

      {status === 'error' && (
        <EmptyState
          title="Не вдалося завантажити заявки"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={retry}
        />
      )}

      {status === 'success' && data && data.registrations.length === 0 && (
        <EmptyState icon={<UserRoundSearch size={32} />} title="Заявок не знайдено" />
      )}

      {status === 'success' && data && data.registrations.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {data.registrations.map((item) => (
              <Link
                key={item.id}
                to={`/admin/registrations/${item.id}`}
                className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 active:bg-[var(--surface-bg)]"
              >
                <Avatar name={item.firstName} photoUrl={item.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {item.firstName}
                      {item.lastName ? ` ${item.lastName}` : ''}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[item.registrationStatus as RegistrationStatusFilter]}`}>
                      {STATUS_LABEL[item.registrationStatus as RegistrationStatusFilter]}
                    </span>
                  </div>
                  {item.username && (
                    <p className="truncate text-xs text-[var(--text-secondary)]">@{item.username}</p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-disabled)]">
                    {item.age !== undefined && <span>{item.age} років</span>}
                    {item.faculty && (
                      <span className="inline-flex items-center gap-1">
                        <GraduationCap size={12} /> {item.faculty}
                      </span>
                    )}
                    {item.registrationSubmittedAt && (
                      <span>{new Date(item.registrationSubmittedAt).toLocaleString('uk-UA')}</span>
                    )}
                  </div>
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
