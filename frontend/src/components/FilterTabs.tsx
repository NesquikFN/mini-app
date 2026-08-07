interface FilterOption<T extends string> {
  value: T
  label: string
}

interface FilterTabsProps<T extends string> {
  options: FilterOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: FilterTabsProps<T>) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-1">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface-card-alt)] text-[var(--text-secondary)]'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
