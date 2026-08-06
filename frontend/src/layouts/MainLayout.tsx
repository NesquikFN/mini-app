import { Outlet } from 'react-router-dom'
import { BottomNavigation } from '../components/BottomNavigation'

export function MainLayout() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col bg-neutral-50">
      <div className="flex-1 pb-24">
        <Outlet />
      </div>
      <BottomNavigation />
    </div>
  )
}
