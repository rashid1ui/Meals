'use client'

import { useEffect, useRef } from 'react'

type Props = {
  onClose: () => void
  labelledBy: string
  children: React.ReactNode
}

// Shared overlay + dialog shell. Moves focus into the dialog on open,
// restores it to whatever was focused before the dialog opened (typically
// the trigger button) when it closes/unmounts, traps Tab within the dialog's
// own focusable elements, and closes on Escape. The click-outside-to-close
// pattern is each caller's own responsibility via the backdrop click.
export default function Modal({ onClose, labelledBy, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    const getFocusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="w-full max-w-md bg-surface-elevated border border-border rounded-panel p-8 shadow-[var(--shadow-modal)] relative z-10 focus:outline-none"
      >
        {children}
      </div>
    </div>
  )
}
