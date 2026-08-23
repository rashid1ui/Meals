'use client'

import { useEffect, useRef } from 'react'

type Props = {
  onClose: () => void
  labelledBy: string
  children: React.ReactNode
  // 'lg' widens the dialog panel (e.g. FoodPickerModal's category tabs +
  // food-card grid need more room than a typical form modal). Defaults to
  // 'md' - today's exact max-w-md - so every existing caller is unaffected.
  size?: 'md' | 'lg'
  // Renders as a full-screen bottom sheet below the `sm` breakpoint and a
  // centered dialog at `sm:` and above, instead of always centered. Pure CSS
  // breakpoint branching (this codebase never branches in JS on viewport
  // size) - matches "Desktop: centered modal, Mobile: bottom sheet".
  // Defaults to false - today's exact always-centered behavior.
  sheet?: boolean
}

// Tailwind's class scanner needs literal, fully-formed class strings (it
// doesn't evaluate template interpolations like `sm:${x}`) - so every
// sheet/size combination is spelled out in full rather than composed at
// runtime from smaller pieces.
const DIALOG_SIZE_CLASSES: Record<'md' | 'lg', { dialog: string; sheet: string }> = {
  md: { dialog: 'max-w-md rounded-panel', sheet: 'max-h-[90vh] rounded-t-panel sm:rounded-panel sm:max-w-md overflow-y-auto' },
  lg: { dialog: 'max-w-lg rounded-panel', sheet: 'max-h-[90vh] rounded-t-panel sm:rounded-panel sm:max-w-lg overflow-y-auto' }
}

// Shared overlay + dialog shell. Moves focus into the dialog on open,
// restores it to whatever was focused before the dialog opened (typically
// the trigger button) when it closes/unmounts, traps Tab within the dialog's
// own focusable elements, and closes on Escape. The click-outside-to-close
// pattern is each caller's own responsibility via the backdrop click.
export default function Modal({ onClose, labelledBy, children, size = 'md', sheet = false }: Props) {
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
    <div
      className={`fixed inset-0 z-50 flex justify-center p-4 ${sheet ? 'items-end sm:items-center' : 'items-center'}`}
    >
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`w-full bg-surface-elevated border border-border p-8 shadow-[var(--shadow-modal)] relative z-10 focus:outline-none ${
          sheet ? DIALOG_SIZE_CLASSES[size].sheet : DIALOG_SIZE_CLASSES[size].dialog
        }`}
      >
        {children}
      </div>
    </div>
  )
}
