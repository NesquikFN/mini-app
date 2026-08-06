import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'outline' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-violet-600 text-white hover:bg-violet-700 disabled:bg-neutral-200 disabled:text-neutral-400',
  secondary:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 disabled:text-neutral-400',
  outline:
    'border border-neutral-300 text-neutral-900 hover:bg-neutral-50 disabled:border-neutral-200 disabled:text-neutral-400',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:bg-neutral-200 disabled:text-neutral-400',
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}
