'use client'

import type { ButtonHTMLAttributes } from 'react'
import { SpinnerIcon } from './icons'

type ButtonVariant = 'primary' | 'brand' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

// "primary" fills with --accent (lime) - MealTrack's actual button fill.
// "brand" fills with --primary (deep green) instead, for a lower-emphasis
// solid action that shouldn't compete with a lime CTA on the same screen.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-foreground hover:bg-accent-strong',
  brand: 'bg-primary text-primary-foreground hover:bg-primary-strong',
  secondary: 'bg-surface border border-border text-foreground hover:bg-surface-elevated',
  danger: 'bg-transparent border border-error text-error hover:bg-error/10',
  ghost: 'bg-transparent text-muted-foreground hover:text-foreground'
}

// Both sizes meet the 44px minimum touch target - "sm" only trims padding
// and font-size for visual density, never the tappable height.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-[44px] px-5 text-[15px]',
  sm: 'min-h-[44px] px-3.5 text-sm'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-pill font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && <SpinnerIcon size={16} className="animate-spin" />}
      {children}
    </button>
  )
}
