import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: number
  icon: ReactNode
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold text-neutral-900">{value}</p>
        <p className="text-sm text-neutral-500">{label}</p>
      </div>
    </div>
  )
}
