import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cake, Camera, Check, GraduationCap, ShieldAlert, X } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { LoadingState } from '../../components/LoadingState'
import { EmptyState } from '../../components/EmptyState'
import { useTelegramBackButton } from '../../hooks/useTelegramBackButton'
import {
  approveAdminRegistration,
  fetchAdminRegistrationDetail,
  getErrorMessage,
  rejectAdminRegistration,
} from '../../services/api'
import type { RegistrationDetail } from '../../types/admin'

type Status = 'loading' | 'success' | 'error'

const STATUS_LABEL: Record<RegistrationDetail['registrationStatus'], string> = {
  not_submitted: 'Не подано',
  pending: 'На розгляді',
  approved: 'Схвалено',
  rejected: 'Відхилено',
}

export function AdminRegistrationDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<RegistrationDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    if (!userId) return
    fetchAdminRegistrationDetail(userId)
      .then((data) => {
        setDetail(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [userId])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  useTelegramBackButton(true, () => navigate('/admin/registrations'))

  if (!userId) return null

  if (status === 'loading') {
    return <LoadingState label="Завантажуємо заявку…" />
  }

  if (status === 'error' || !detail) {
    return (
      <EmptyState
        title="Не вдалося завантажити заявку"
        description={errorMessage ?? undefined}
        actionLabel="Спробувати ще раз"
        onAction={retry}
      />
    )
  }

  const isPending = detail.registrationStatus === 'pending'

  async function handleApprove() {
    setApproving(true)
    setActionError(null)
    try {
      const updated = await approveAdminRegistration(userId!)
      setDetail(updated)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setApproving(false)
    }
  }

  async function handleReject(reason?: string) {
    setRejecting(true)
    setActionError(null)
    try {
      const updated = await rejectAdminRegistration(userId!, reason)
      setDetail(updated)
      setShowRejectDialog(false)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setRejecting(false)
    }
  }

  const instagramUrl = detail.instagram ? `https://instagram.com/${detail.instagram}` : undefined

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <Avatar name={detail.firstName} photoUrl={detail.photoUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-[var(--text-primary)]">
            {detail.firstName}
            {detail.lastName ? ` ${detail.lastName}` : ''}
          </p>
          {detail.username && <p className="text-sm text-[var(--text-secondary)]">@{detail.username}</p>}
          <p className="font-mono text-xs text-[var(--text-disabled)]">telegram_id: {detail.telegramId}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--surface-card-alt)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
          {STATUS_LABEL[detail.registrationStatus]}
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Дані заявки</h2>

        {detail.age !== undefined && (
          <DetailRow icon={<Cake size={16} />} label="Вік" value={`${detail.age} років`} />
        )}
        {detail.faculty && (
          <DetailRow icon={<GraduationCap size={16} />} label="Факультет" value={detail.faculty} />
        )}
        {instagramUrl && (
          <DetailRow
            icon={<Camera size={16} />}
            label="Instagram"
            value={
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)]"
              >
                @{detail.instagram}
              </a>
            }
          />
        )}

        {detail.bio && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">Про себе</p>
            <p className="text-sm text-[var(--text-primary)]">{detail.bio}</p>
          </div>
        )}

        {detail.registrationSubmittedAt && (
          <p className="text-xs text-[var(--text-disabled)]">
            Подано: {new Date(detail.registrationSubmittedAt).toLocaleString('uk-UA')}
          </p>
        )}
        {detail.registrationReviewedAt && (
          <p className="text-xs text-[var(--text-disabled)]">
            Розглянуто: {new Date(detail.registrationReviewedAt).toLocaleString('uk-UA')}
          </p>
        )}
      </div>

      {detail.registrationStatus === 'rejected' && detail.registrationRejectionReason && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Причина відхилення</p>
            <p className="mt-0.5 text-red-300/90">{detail.registrationRejectionReason}</p>
          </div>
        </div>
      )}

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      {isPending && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            loading={rejecting && !showRejectDialog}
            disabled={approving}
            onClick={() => {
              setActionError(null)
              setShowRejectDialog(true)
            }}
          >
            <X size={17} /> Відхилити
          </Button>
          <Button loading={approving} disabled={rejecting} onClick={handleApprove}>
            <Check size={17} /> Схвалити
          </Button>
        </div>
      )}

      {showRejectDialog && (
        <RejectRegistrationDialog
          userName={detail.firstName}
          loading={rejecting}
          onReject={handleReject}
          onCancel={() => {
            if (rejecting) return
            setShowRejectDialog(false)
          }}
        />
      )}
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[var(--accent)]">{icon}</span>
      <span className="text-[var(--text-secondary)]">{label}:</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function RejectRegistrationDialog({
  userName,
  loading,
  onReject,
  onCancel,
}: {
  userName: string
  loading: boolean
  onReject: (reason?: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Відхилити заявку {userName}?
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Причина необов'язкова, але допоможе людині виправити дані й подати заявку ще раз.
        </p>

        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Наприклад: вкажіть реальний факультет"
          className="mt-4 w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)]"
        />

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={loading} onClick={onCancel}>
            Скасувати
          </Button>
          <Button variant="danger" loading={loading} onClick={() => onReject(reason.trim() || undefined)}>
            Відхилити
          </Button>
        </div>
      </div>
    </div>
  )
}
