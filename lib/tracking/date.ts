// Pure date helpers for daily nutrition tracking. This app has no stored
// per-user timezone (verified: no such column anywhere, no existing
// timezone handling in the codebase) - "today" is the browser's local
// calendar date, reported by the client and validated server-side against
// a tolerance window around the server's own UTC clock. This is the
// standard, honest approach for an app that has no timezone infrastructure
// to build on, rather than silently assuming UTC or fabricating one.

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function isValidLocalDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false
  const d = new Date(`${dateStr}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr
}

// Accepts a client-reported "today" only if it's within +/-1 day of the
// server's own UTC date - covers every real-world timezone offset
// (UTC-12 to UTC+14) without needing a stored per-user timezone. This is
// what stops the tracking actions from being used to backdate arbitrary
// history through the client-supplied date parameter.
export function isPlausibleToday(dateStr: string): boolean {
  if (!isValidLocalDate(dateStr)) return false
  const now = new Date()
  const serverMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const [y, m, d] = dateStr.split('-').map(Number)
  const claimedMs = Date.UTC(y, m - 1, d)
  const diffDays = Math.round((claimedMs - serverMs) / 86400000)
  return diffDays >= -1 && diffDays <= 1
}

// Client-side only: today's date in the browser's LOCAL timezone (not
// toISOString, which is UTC). Safe to import from a 'use client' component.
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayUTCString(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

export function shiftDateUTC(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + deltaDays * 86400000
  const shifted = new Date(ms)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const startMs = Date.UTC(sy, sm - 1, sd)
  const endMs = Date.UTC(ey, em - 1, ed)
  return Math.round((endMs - startMs) / 86400000) + 1
}

export function lastDayOfMonthUTC(year: number, month: number): string {
  // Day 0 of the next month is the last day of this month.
  const d = new Date(Date.UTC(year, month, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
