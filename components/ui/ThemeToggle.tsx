'use client'

// Manual light/dark switch. Light is the app default (app/globals.css);
// dark only ever applies via :root[data-theme="dark"], which this is the
// only thing that sets. The choice persists to localStorage and is
// re-applied before paint by the inline script in app/layout.tsx, so
// there's no flash of the wrong theme on reload.
//
// Reads current state through useSyncExternalStore rather than
// useState+useEffect: the DOM attribute it mirrors can differ between the
// server render (always light) and the client (possibly dark, from the
// pre-paint script), and useSyncExternalStore's getServerSnapshot is the
// React-sanctioned way to reconcile that without a hydration mismatch or
// a manual setState-in-effect.
import { useSyncExternalStore } from 'react'
import { MoonIcon, SunIcon } from './icons'

const STORAGE_KEY = 'gym-meals-theme'
const THEME_CHANGE_EVENT = 'gym-meals-theme-change'

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback)
}

function getSnapshot() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

function getServerSnapshot() {
  return false
}

function setDarkTheme(next: boolean) {
  if (next) {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
  } catch {
    // Storage unavailable (private browsing, etc.) - theme still applies
    // for this session, it just won't persist across reloads.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

type Props = {
  variant?: 'icon' | 'menu-item'
}

export default function ThemeToggle({ variant = 'icon' }: Props) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'
  const toggle = () => setDarkTheme(!isDark)

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={toggle}
        className="flex items-center gap-2 min-h-[44px] px-3 rounded-control text-sm font-semibold text-foreground hover:bg-surface transition-colors w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="w-11 h-11 flex items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  )
}
