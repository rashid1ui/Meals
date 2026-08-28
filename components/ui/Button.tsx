'use client'

import type { ButtonHTMLAttributes } from 'react'
import { SpinnerIcon } from './icons'
import { buttonBaseClassName, type ButtonVariant, type ButtonSize } from './buttonStyles'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
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
      className={buttonBaseClassName(variant, size, className)}
      {...rest}
    >
      {loading && <SpinnerIcon size={16} className="animate-spin" />}
      {children}
    </button>
  )
}
