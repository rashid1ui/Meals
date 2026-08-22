'use client'

import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  helperText?: string
  error?: string
  numeric?: boolean
  trailing?: ReactNode
}

export default function Input({
  label,
  helperText,
  error,
  numeric = false,
  trailing,
  id,
  className = '',
  ...rest
}: Props) {
  const generatedId = useId()
  const inputId = id || generatedId
  const helperId = `${inputId}-helper`
  const errorId = `${inputId}-error`

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          aria-invalid={Boolean(error)}
          className={`w-full min-h-[44px] bg-background border rounded-control px-4 py-2.5 text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary ${
            error ? 'border-error' : 'border-border'
          } ${numeric ? 'font-mono tabular-nums' : ''} ${trailing ? 'pr-14' : ''} ${className}`}
          {...rest}
        />
        {trailing && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {trailing}
          </span>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
