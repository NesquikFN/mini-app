interface FilterOption<T extends string> {
  value: T
  label: string
}

interface FilterTabsProps<T extends string> {
  options: FilterOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function FilterTabs<T extends string>({ options, value, onChange }: FilterTabsProps<T>) {
  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
