'use client'

import type { ButtonHTMLAttributes } from 'react'
import { SpinnerIcon } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-strong',
  secondary: 'bg-surface border border-border text-foreground hover:bg-surface-elevated',
  danger: 'bg-transparent border border-error text-error hover:bg-error/10',
  ghost: 'bg-transparent text-muted-foreground hover:text-foreground'
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-[44px] px-5 text-[15px]',
  sm: 'min-h-[36px] px-3.5 text-sm'
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && <SpinnerIcon size={16} className="animate-spin" />}
      {children}
    </button>
  )
}
