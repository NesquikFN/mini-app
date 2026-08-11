import { quickPlansRepository } from '../repositories/quick-plans.repository'

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Прибирає прострочені плани раз на годину. Це лише гігієна таблиці:
 * коректність від нього НЕ залежить — кожне читання в
 * quick-plans.repository і так фільтрує `expires_at > now()`, тож навіть
 * якщо прибиральник ніколи не спрацює, протухлий план не з'явиться ні в
 * API, ні в UI. Той самий підхід «звичайний setInterval у єдиному
 * довгоживучому процесі», що й у event-reminders.service.ts — окремої
 * cron-інфраструктури на Railway немає й не потрібно.
 */
export async function cleanupExpiredQuickPlans(): Promise<void> {
  const removed = await quickPlansRepository.deleteExpired()
  if (removed > 0) {
    console.log(`Прибрано прострочених швидких планів: ${removed}`)
  }
}

export function startQuickPlanCleanupScheduler(): void {
  cleanupExpiredQuickPlans().catch((error) =>
    console.error('Початкове прибирання швидких планів не вдалося:', error),
  )
  setInterval(() => {
    cleanupExpiredQuickPlans().catch((error) =>
      console.error('Прибирання швидких планів не вдалося:', error),
    )
  }, CLEANUP_INTERVAL_MS)
}
