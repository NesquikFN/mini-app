import { Outlet } from 'react-router-dom'
import { BottomNavigation } from '../components/BottomNavigation'

export function MainLayout() {
  return (
    <div className="theme-dorm mx-auto flex min-h-screen w-full max-w-[560px] flex-col bg-[var(--surface-bg)]">
      <div className="flex-1 pb-24">
        <Outlet />
      </div>
      <BottomNavigation />
    </div>
  )
}
