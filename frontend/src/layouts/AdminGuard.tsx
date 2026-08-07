import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAdminStatus } from '../hooks/useAdminStatus'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'

/** Реальний захист /admin — на бекенді (requireTelegramAuth +
 * requireAdmin на кожному /api/admin/* запиті). Це лише UX-шар: не
 * рендерити адмінку, поки GET /api/admin/check не підтвердив 200. */
export function AdminGuard() {
  const { status, recheck } = useAdminStatus()

  if (status === 'loading') {
    return (
      <FullScreenCenter>
        <LoadingState label="Перевіряємо права доступу…" />
      </FullScreenCenter>
    )
  }

  if (status === 'not-admin') {
    return <Navigate to="/" replace />
  }

  if (status === 'error') {
    return (
      <FullScreenCenter>
        <EmptyState
          icon={<ShieldAlert size={40} />}
          title="Не вдалося перевірити доступ"
          description="Перевірте з'єднання і спробуйте ще раз."
          actionLabel="Спробувати ще раз"
          onAction={recheck}
        />
      </FullScreenCenter>
    )
  }

  return <Outlet />
}

function FullScreenCenter({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center bg-neutral-50 px-4">
      {children}
    </div>
  )
}
