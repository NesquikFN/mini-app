import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft, Ban, CalendarDays, Gamepad2, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'

const TABS = [
  { to: '/admin', label: 'Огляд', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Користувачі', icon: Users, end: false },
  { to: '/admin/events', label: 'Події', icon: CalendarDays, end: false },
  { to: '/admin/admins', label: 'Адміни', icon: ShieldCheck, end: false },
  { to: '/admin/banned', label: 'ЧС', icon: Ban, end: false },
  { to: '/admin/templates', label: 'Ігри', icon: Gamepad2, end: false },
]

export function AdminLayout() {
  const navigate = useNavigate()

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
