'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCalendarTracking, type CalendarDay } from '../tracking-actions'
import Card from '@/components/ui/Card'
import { ChevronLeftIcon, ChevronRightIcon, AlertIcon } from '@/components/ui/icons'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

type Tier = 'excellent' | 'good' | 'partial' | 'low' | 'none'

function tierFor(pct: number | null): Tier {
  if (pct === null) return 'none'
  if (pct >= 90) return 'excellent'
  if (pct >= 70) return 'good'
  if (pct >= 40) return 'partial'
  return 'low'
}

// Only three hues (success/warning/error) plus neutral - "excellent" and
// "good" are the same hue at different intensity rather than a fourth
// distinct color, so five states stay readable without turning the
// calendar into a rainbow.
const TIER_CLASS: Record<Tier, string> = {
  excellent: 'bg-success/25 border-success/50 text-success',
  good: 'bg-success/10 border-success/25 text-success/90',
  partial: 'bg-warning/15 border-warning/35 text-warning',
  low: 'bg-error/10 border-error/30 text-error/90',
  none: 'bg-surface-elevated border-border text-muted-foreground'
}

const LEGEND: { tier: Tier; label: string }[] = [
  { tier: 'excellent', label: '90-100%' },
  { tier: 'good', label: '70-89%' },
  { tier: 'partial', label: '40-69%' },
  { tier: 'low', label: '0-39%' },
  { tier: 'none', label: 'No data' }
]

// Monday-first weekday index (0=Mon..6=Sun) for a given calendar date,
// computed in the browser's local time - this is purely calendar cell
// layout (which column a day-of-month falls under), not a tracking-date
// computation, so it doesn't need to match the UTC-anchored date logic the
// rest of tracking-actions.ts uses for "today"/date ranges.
function mondayFirstWeekday(year: number, monthIndex0: number, day: number): number {
  const jsWeekday = new Date(year, monthIndex0, day).getDay() // 0=Sun..6=Sat
  return (jsWeekday + 6) % 7
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

// Below the existing Weekly/Monthly Nutrition summary - a per-day view of
// the exact same daily_tracking data (via getCalendarTracking, which reuses
// computeDayAdherencePct/pctOf), answering "how well did I do on each
// individual day this month?" rather than an averaged period total.
export default function DailyCalendar() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1) // 1-12

  const [days, setDays] = useState<CalendarDay[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getCalendarTracking(year, month).then(result => {
      if (cancelled) return
      if ('error' in result) setError(result.error)
      else setDays(result.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [year, month])

  const goPrevMonth = () => {
    if (month === 1) {
      setYear(y => y - 1)
      setMonth(12)
    } else {
      setMonth(m => m - 1)
    }
  }

  const goNextMonth = () => {
    if (month === 12) {
      setYear(y => y + 1)
      setMonth(1)
    } else {
      setMonth(m => m + 1)
    }
  }

  const pctByDate = useMemo(() => {
    const map = new Map<string, number | null>()
    days?.forEach(d => map.set(d.date, d.adherencePct))
    return map
  }, [days])

  const totalDays = daysInMonth(year, month)
  const leadingBlanks = mondayFirstWeekday(year, month - 1, 1)
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1)
  ]

  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-display text-lg font-bold text-foreground">Daily Progress</h2>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <span className="font-display text-sm font-bold text-foreground" aria-live="polite">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-lg">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
            {WEEKDAY_LABELS.map(label => (
              <div
                key={label}
                className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`blank-${idx}`} aria-hidden="true" />

              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

              if (loading) {
                return <div key={date} className="aspect-square rounded-lg bg-surface border border-border animate-pulse" />
              }

              const pct = pctByDate.get(date) ?? null
              const tier = tierFor(pct)

              return (
                <div
                  key={date}
                  title={pct === null ? `${date}: no tracking data` : `${date}: ${pct}% adherence`}
                  className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors ${TIER_CLASS[tier]}`}
                >
                  <span className="text-xs sm:text-sm font-bold text-foreground">{day}</span>
                  <span className="text-[9px] sm:text-[10px] font-mono tabular-nums font-semibold">
                    {pct === null ? '—' : `${pct}%`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-x-3 gap-y-1.5 flex-wrap pt-1">
        {LEGEND.map(({ tier, label }) => (
          <span key={tier} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={`w-2.5 h-2.5 rounded-full border ${TIER_CLASS[tier]}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </Card>
  )
}
