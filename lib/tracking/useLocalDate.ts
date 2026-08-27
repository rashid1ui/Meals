'use client'

import { useEffect, useState } from 'react'
import { getLocalDateString } from './date'

// How often to re-check the date as a fallback, for a tab that stays both
// visible AND focused right through midnight without ever backgrounding or
// blurring (so the visibilitychange/focus listeners below never fire). A
// full minute is frequent enough that the delay before a genuine midnight
// rollover is caught is never user-noticeable, while being cheap enough to
// run indefinitely in the background.
const FALLBACK_CHECK_INTERVAL_MS = 60_000

// The browser's current local "today" (YYYY-MM-DD), kept live for the
// lifetime of the component - NOT frozen at mount. A plain
// `useState(() => getLocalDateString())` lazy initializer only ever runs
// once; a session left open across midnight (laptop lid closed overnight,
// a background tab) kept reading and writing against the date it happened
// to open on for its ENTIRE remaining lifetime, silently misattributing any
// food logged after midnight to the wrong day (server-side
// isPlausibleToday's +/-1 day tolerance let the write through without
// complaint).
//
// Recomputes whenever the tab becomes visible again or the window regains
// focus (the two events that reliably fire when a user returns to a
// backgrounded/minimized tab), plus a periodic fallback check for the rarer
// case of a tab that never backgrounds/blurs at all. Only actually updates
// state (triggering a re-render) when the computed date has genuinely
// changed - every other check is a no-op re-render-wise.
export function useLocalDate(): string {
  const [date, setDate] = useState(() => getLocalDateString())

  useEffect(() => {
    const recompute = () => {
      const next = getLocalDateString()
      setDate(prev => (prev === next ? prev : next))
    }

    // Catches the return-from-background case immediately, rather than
    // waiting up to a minute for the fallback interval.
    recompute()

    document.addEventListener('visibilitychange', recompute)
    window.addEventListener('focus', recompute)
    const interval = setInterval(recompute, FALLBACK_CHECK_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', recompute)
      window.removeEventListener('focus', recompute)
      clearInterval(interval)
    }
  }, [])

  return date
}
