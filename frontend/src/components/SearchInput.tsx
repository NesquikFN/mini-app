import { Search } from 'lucide-react'
import type { ChangeEvent } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Пошук…' }: SearchInputProps) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
      />
      <input
        type="text"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-500"
      />
    </div>
  )
}
