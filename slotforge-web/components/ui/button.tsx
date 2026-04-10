import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:   'bg-sf-gold text-[#1a1200] font-semibold hover:opacity-90',
  secondary: 'border border-sf-border bg-sf-surface text-sf-text hover:border-sf-gold/30 hover:bg-sf-overlay',
  ghost:     'text-sf-muted hover:text-sf-text hover:bg-sf-surface/60',
  danger:    'border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-sm rounded-xl',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'outline-none focus-visible:ring-2 focus-visible:ring-sf-gold focus-visible:ring-offset-2 focus-visible:ring-offset-sf-base',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  )
}
