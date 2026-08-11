import { useLocation, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, Gamepad2, PlusCircle, User } from 'lucide-react'

const items = [
  { to: '/', label: 'Головна', icon: Home, end: true },
  { to: '/events', label: 'Події', icon: CalendarDays, end: false },
  { to: '/create', label: 'Створити', icon: PlusCircle, end: false },
  { to: '/templates', label: 'Ігри', icon: Gamepad2, end: false },
  { to: '/profile', label: 'Профіль', icon: User, end: false },
]

function isPathActive(pathname: string, to: string, end: boolean): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** Plain <button onClick={navigate(...)}> instead of <Link>/<NavLink> —
 * confirmed via on-device debugging that some Telegram clients swallow
 * clicks on <a> tags after the Mini App was opened via a Direct Mini App
 * deep link (t.me/<bot>/<short_name>?startapp=...): the tap fires and
 * lands on the right element, but never navigates, while a same-page
 * plain <button onClick> (e.g. "Видалити") works fine regardless. */
export function BottomNavigation() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--surface-border)] bg-[var(--surface-bg)]">
      <div className="mx-auto flex w-full max-w-[560px] items-stretch justify-between px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, label, icon: Icon, end }) => {
          const active = isPathActive(pathname, to, end)
          return (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-all active:scale-90 ${
                active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={22} strokeWidth={2} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
