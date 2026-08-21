// Shared SVG icon set for Gym Meals, replacing text-glyph "icons" (+, -, x, <->)
// across the app. Every icon is decorative by default (aria-hidden) - the
// interactive element wrapping it (a <button>, etc.) is what carries the
// accessible name via aria-label, per standard icon-button accessibility
// practice.
'use client'

import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, strokeWidth = 2, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props
  }
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function SwapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m7 3 4 4-4 4M3 7h8M17 21l-4-4 4-4M21 17h-8" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// Caller adds `className="animate-spin"` (Tailwind's built-in utility) -
// reduced-motion handling is centralized once in globals.css rather than
// baked into this component.
export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}
