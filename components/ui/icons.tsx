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

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

// Ascending bars - used for the Insights nav item and anywhere else a
// generic "analytics/performance" glyph is needed.
export function ChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V12M12 20V4M20 20V14" />
    </svg>
  )
}

// Tracking tri-state: empty circle (not eaten).
export function CircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

// Tracking tri-state: half-filled circle (partially eaten) - a meal-level
// aggregate state only; individual foods are always binary (CheckIcon or
// CircleIcon).
export function HalfCircleIcon(props: IconProps) {
  const { fill, ...rest } = base(props)
  return (
    <svg {...rest} fill={fill}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Theme toggle: shown while the app is in light theme (offers switching to dark).
export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}

// Theme toggle: shown while the app is in dark theme (offers switching to light).
export function SunIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ScaleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18M7 21h10" />
      <path d="M5 7h14" />
      <path d="M5 7 2 13a3 3 0 0 0 6 0L5 7ZM19 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
    </svg>
  )
}

export function DumbbellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 9v6M2 10.5v3M7 7v10M17 7v10M20 10.5v3M22 9v6" />
      <path d="M7 12h10" />
    </svg>
  )
}

export function PillIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="9" width="18" height="8" rx="4" transform="rotate(-45 12 13)" />
      <path d="m9.5 15.5 5-5" />
    </svg>
  )
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

// Wheat sheaf - the carbs macro glyph on the dashboard summary cards.
export function WheatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22V9" />
      <path d="M12 9c0-2 1.6-3.6 3.6-3.6C15.6 7.4 14 9 12 9ZM12 9c0-2-1.6-3.6-3.6-3.6C8.4 7.4 10 9 12 9Z" />
      <path d="M12 15c0-2 1.6-3.6 3.6-3.6C15.6 13.4 14 15 12 15ZM12 15c0-2-1.6-3.6-3.6-3.6C8.4 13.4 10 15 12 15Z" />
    </svg>
  )
}

// Droplet - the fat macro glyph on the dashboard summary cards.
export function DropletIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3s6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 6-10 6-10Z" />
    </svg>
  )
}

// Fork + knife - the "meals" glyph on the daily summary stat cards.
export function UtensilsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3v18M4 3v6a3 3 0 0 0 6 0V3" />
      <path d="M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9" />
    </svg>
  )
}

// Apple - the "foods" glyph on the daily summary stat cards.
export function AppleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 7c-1.5-2-4-2.5-5.5-1C4.5 7.5 4 11 5.5 15c1 2.7 2.5 5 4 5 1 0 1.5-.6 2.5-.6s1.5.6 2.5.6c1.5 0 3-2.3 4-5 1.5-4 1-7.5-1-9-1.5-1.5-4-1-5.5 1Z" />
      <path d="M12 7c.3-1.7 1.5-3 3-3.3" />
    </svg>
  )
}
