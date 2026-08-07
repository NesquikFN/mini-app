import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'outline' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white active:bg-[var(--accent-hover)] disabled:bg-[var(--surface-card-alt)] disabled:text-[var(--text-disabled)]',
  secondary:
    'bg-[var(--surface-card-alt)] text-[var(--text-primary)] active:opacity-80 disabled:text-[var(--text-disabled)]',
  outline:
    'border border-[var(--surface-border)] text-[var(--text-primary)] active:bg-[var(--surface-card-alt)] disabled:border-[var(--surface-border)] disabled:text-[var(--text-disabled)]',
  danger:
    'bg-red-600 text-white active:bg-red-700 disabled:bg-[var(--surface-card-alt)] disabled:text-[var(--text-disabled)]',
}

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  )
}
