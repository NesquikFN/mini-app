import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, PlusCircle, User } from 'lucide-react'

const items = [
  { to: '/', label: 'Головна', icon: Home, end: true },
  { to: '/events', label: 'Події', icon: CalendarDays, end: false },
  { to: '/create', label: 'Створити', icon: PlusCircle, end: false },
  { to: '/profile', label: 'Профіль', icon: User, end: false },
]

export function BottomNavigation() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--surface-border)] bg-[var(--surface-bg)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[560px] items-stretch justify-between px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-all active:scale-90 ${
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
              }`
            }
          >
            <Icon size={22} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
