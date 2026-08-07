import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const TABS = [
  { to: '/admin', label: 'Огляд', emoji: '📊', end: true },
  { to: '/admin/users', label: 'Користувачі', emoji: '👥', end: false },
  { to: '/admin/events', label: 'Події', emoji: '📅', end: false },
  { to: '/admin/admins', label: 'Адміни', emoji: '🛡️', end: false },
]

export function AdminLayout() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label="Повернутись у застосунок"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-neutral-900">DormHub Admin</p>
            <p className="truncate text-xs text-neutral-500">Панель управління</p>
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
                  isActive ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600'
                }`
              }
            >
              {tab.emoji} {tab.label}
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
