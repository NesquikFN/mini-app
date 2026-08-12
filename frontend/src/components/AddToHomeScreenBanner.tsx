import { useState } from 'react'
import { House } from 'lucide-react'
import { Toast } from './Toast'
import type { HomeScreenShortcut } from '../hooks/useHomeScreenShortcut'

type AddToHomeScreenBannerProps = HomeScreenShortcut

/**
 * Компактна пропозиція додати DormHub на головний екран телефона.
 *
 * Живе в кінці контенту HomePage — не фіксована й не модальна: людина
 * дочитує стрічку подій і бачить пропозицію, а не отримує її поверх
 * усього. Через це вона й не перекриває BottomNavigation: у MainLayout
 * контент має відступ знизу, а сам банер лишається у звичайному потоці.
 *
 * Уся логіка «коли показувати» — в useHomeScreenShortcut; тут лише
 * вигляд і два обробники.
 */
export function AddToHomeScreenBanner({
  isVisible,
  addToHomeScreen,
  dismiss,
  justAdded,
}: AddToHomeScreenBannerProps) {
  // Toast виводиться з justAdded, а не дублює його в стан: окремо
  // зберігаємо лише факт, що користувач його вже закрив.
  const [toastClosed, setToastClosed] = useState(false)
  const showToast = justAdded && !toastClosed

  return (
    <>
      {isVisible && (
        <section
          data-testid="add-to-home-screen-banner"
          className="relative overflow-hidden rounded-[26px] border border-orange-500/25 bg-[linear-gradient(135deg,rgba(255,122,0,0.16),rgba(255,122,0,0.05)_55%,rgba(255,255,255,0.02))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.25)] animate-[dormhub-fade-in_0.2s_ease]"
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-orange-500/15 blur-3xl" />

          <div className="relative flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-300/25 bg-orange-500/15 text-[var(--accent-light)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <House size={24} strokeWidth={2} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold tracking-tight text-[var(--text-primary)]">
                DormHub завжди поруч
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--text-secondary)]">
                Додайте застосунок на головний екран і відкривайте події одним дотиком.
              </p>
            </div>
          </div>

          <div className="relative mt-3.5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={addToHomeScreen}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-black transition-all duration-100 active:scale-[0.97] active:bg-[var(--accent-hover)]"
            >
              Додати
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--surface-border)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-all duration-100 active:scale-[0.97] active:bg-[var(--surface-card-alt)]"
            >
              Не зараз
            </button>
          </div>
        </section>
      )}

      {showToast && (
        <Toast message="DormHub додано на головний екран" onDismiss={() => setToastClosed(true)} />
      )}
    </>
  )
}
