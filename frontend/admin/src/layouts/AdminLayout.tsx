import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, CalendarDays, Menu, X } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Користувачі', icon: Users, end: false },
  { to: '/events', label: 'Події', icon: CalendarDays, end: false },
]

export function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <SidebarContent onNavigate={() => undefined} />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-20 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-30 flex w-64 flex-col bg-white">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:hidden">
          <button
            type="button"
            aria-label="Меню"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-neutral-900">DormHub Admin</span>
        </header>

        <main className="flex-1 overflow-x-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
        <span className="font-semibold text-neutral-900">DormHub Admin</span>
        <button
          type="button"
          aria-label="Закрити меню"
          onClick={onNavigate}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden"
        >
          <X size={18} />
        </button>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
