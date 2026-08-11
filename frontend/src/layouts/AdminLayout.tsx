import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Ban, Bell, CalendarDays, ClipboardList, Crown, History, LayoutDashboard, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { fetchAdminRegistrations } from '../services/api'

// "Ігри" (шаблони подій) переїхали в головну навігацію (BottomNavigation)
// — доступні всім юзерам, не лише адмінам.
const TABS = [
  { to: '/admin', label: 'Огляд', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Користувачі', icon: Users, end: false },
  { to: '/admin/events', label: 'Події', icon: CalendarDays, end: false },
  { to: '/admin/registrations', label: 'Заявки', icon: ClipboardList, end: false },
  { to: '/admin/admins', label: 'Адміни', icon: ShieldCheck, end: false },
  { to: '/admin/hosts', label: 'Хости', icon: Sparkles, end: false },
  { to: '/admin/vips', label: 'VIP', icon: Crown, end: false },
  { to: '/admin/gpus', label: 'ГПУ', icon: BadgeCheck, end: false },
  { to: '/admin/banned', label: 'ЧС', icon: Ban, end: false },
  { to: '/admin/notifications', label: 'Сповіщення', icon: Bell, end: false },
  { to: '/admin/notification-log', label: 'Журнал', icon: History, end: false },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [pendingCount, setPendingCount] = useState(0)

  // Найдешевший спосіб тримати бейдж свіжим без окремого контексту чи
  // ручного "оновити лічильник" колбека: перезапитуємо кількість pending
  // заявок при кожній зміні шляху всередині адмінки — і після
  // approve/reject адмін звично тисне "назад" на список заявок, і при
  // переході на будь-яку іншу вкладку теж.
  useEffect(() => {
    fetchAdminRegistrations(1, 1, 'pending')
      .then((data) => setPendingCount(data.pagination.total))
      .catch(() => {
        // Бейдж — не критична інформація, тихо лишаємо попереднє значення.
      })
  }, [location.pathname])

  return (
    <div className="theme-dorm mx-auto flex min-h-screen w-full max-w-[720px] flex-col bg-[var(--surface-bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-10 border-b border-[var(--surface-border)] bg-black/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label="Повернутись у застосунок"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] text-[var(--accent)] active:bg-[var(--surface-card-alt)]"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">DormHub <span className="text-[var(--accent)]">Admin</span></p>
            <p className="truncate text-xs text-[var(--text-secondary)]">Панель управління</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--accent)] text-black shadow-[0_0_18px_rgba(255,122,0,0.24)]'
                    : 'border border-[var(--surface-border)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
                }`
              }
            >
              <tab.icon size={15} className="mr-1 inline-block align-[-2px]" /> {tab.label}
              {tab.to === '/admin/registrations' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 px-4 py-4 pb-10">
        <Outlet />
      </main>
    </div>
  )
}
