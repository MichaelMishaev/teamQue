import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Single responsibility: every tappable button in the app — variants + touch sizes (design.md §5). */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'default' | 'big'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent border-accent text-on-accent',
  secondary: 'bg-surface-2 border-line text-ink',
  danger: 'bg-transparent border-danger text-danger',
  ghost: 'bg-transparent border-transparent text-muted',
}

const sizeClasses: Record<Size, string> = {
  default: 'min-h-[var(--btn-height)] text-base',
  big: 'min-h-[var(--btn-height-big)] text-[17.5px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'secondary', size = 'default', className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--btn-radius)] border px-3 font-semibold',
        'transition-colors duration-150 disabled:opacity-40',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
}
