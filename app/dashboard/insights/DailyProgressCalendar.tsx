'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getMonthlyCalendar, type CalendarDay, type MonthlyCalendar } from '../tracking-actions'
import { adherenceTier, pctOf, type AdherenceTier } from '@/lib/tracking/logic'
import { getLocalDateString } from '@/lib/tracking/date'
import Card from '@/components/ui/Card'
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const TIER_STYLES: Record<AdherenceTier, { bg: string; border: string; text: string; dot: string; label: string }> = {
  excellent: { bg: 'bg-tier-excellent/15', border: 'border-tier-excellent/40', text: 'text-tier-excellent', dot: 'bg-tier-excellent', label: 'Excellent' },
  good: { bg: 'bg-tier-good/15', border: 'border-tier-good/40', text: 'text-tier-good', dot: 'bg-tier-good', label: 'Good' },
  partial: { bg: 'bg-tier-partial/15', border: 'border-tier-partial/40', text: 'text-tier-partial', dot: 'bg-tier-partial', label: 'Partial' },
  low: { bg: 'bg-tier-low/15', border: 'border-tier-low/40', text: 'text-tier-low', dot: 'bg-tier-low', label: 'Low' },
  verylow: { bg: 'bg-tier-verylow/15', border: 'border-tier-verylow/40', text: 'text-tier-verylow', dot: 'bg-tier-verylow', label: 'Very Low' },
  none: { bg: 'bg-surface', border: 'border-border', text: 'text-muted-foreground', dot: 'bg-tier-none', label: 'No data' }
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

// 0 = Monday .. 6 = Sunday, converted from JS Date's native 0 = Sunday.
function mondayFirstWeekday(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay()
  return (jsDay + 6) % 7
}

function fullDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function cellAriaLabel(day: CalendarDay, isToday: boolean): string {
  const label = `${fullDateLabel(day.date)}${isToday ? ' (today)' : ''}`
  if (!day.hasData) return `${label}, no data tracked`
  return `${label}, ${day.adherencePct}% adherence, ${day.mealsCompleted} of ${day.mealsTotal} meals completed`
}

type DetailStatProps = { emoji: string; label: string; value: number; target: number; unit: string; barClass: string }

function DetailStat({ emoji, label, value, target, unit, barClass }: DetailStatProps) {
  const pct = Math.min(100, Math.max(0, pctOf(value, target)))
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-[11px] font-semibold text-muted-foreground truncate">
        <span aria-hidden="true">{emoji} </span>
        {label}
      </div>
      <div className="font-mono tabular-nums text-sm font-bold text-foreground">
        {Math.round(value)}
        <span className="text-muted-foreground font-normal">
          /{Math.round(target)}
          {unit}
        </span>
      </div>
      <div className="h-1 rounded-full bg-surface-elevated border border-border overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function DayDetail({ day, dateStr }: { day: CalendarDay | undefined; dateStr: string | null }) {
  if (!dateStr) {
    return <p className="text-sm text-muted-foreground">Hover, tap, or focus a day to see its details.</p>
  }

  const label = fullDateLabel(dateStr)

  if (!day || !day.hasData) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">No meals tracked this day.</p>
      </div>
    )
  }

  const tier = adherenceTier(day.adherencePct)
  const style = TIER_STYLES[tier]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <span
          className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${style.bg} ${style.text} ${style.border}`}
        >
          {day.adherencePct}% {style.label}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DetailStat emoji="🔥" label="Calories" value={day.consumed.calories} target={day.target.calories} unit="" barClass="bg-calories" />
        <DetailStat emoji="💪" label="Protein" value={day.consumed.protein} target={day.target.protein} unit="g" barClass="bg-protein" />
        <DetailStat emoji="⚡" label="Carbs" value={day.consumed.carbs} target={day.target.carbs} unit="g" barClass="bg-carbs" />
        <DetailStat emoji="🥑" label="Fat" value={day.consumed.fat} target={day.target.fat} unit="g" barClass="bg-fat" />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-mono tabular-nums font-bold text-foreground">
          {day.mealsCompleted}/{day.mealsTotal}
        </span>{' '}
        meals completed
      </p>
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="space-y-1.5 sm:space-y-2" aria-hidden="true">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-control bg-surface-elevated border border-border animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function DailyProgressCalendar() {
  const todayLocal = useMemo(() => getLocalDateString(), [])
  const initial = useMemo(() => {
    const [y, m] = todayLocal.split('-').map(Number)
    return { year: y, month: m }
  }, [todayLocal])

  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)
  const [calendar, setCalendar] = useState<MonthlyCalendar | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(todayLocal)

  const cellRefs = useRef(new Map<number, HTMLButtonElement>())

  useEffect(() => {
    let cancelled = false
    getMonthlyCalendar(viewYear, viewMonth).then(result => {
      if (cancelled) return
      if ('error' in result) setError(result.error)
      else setCalendar(result.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [viewYear, viewMonth])

  const isCurrentMonth = viewYear === initial.year && viewMonth === initial.month

  // Loading/error reset happens here, in the event handler that triggers the
  // navigation, rather than inside the effect above - the effect's own body
  // stays a pure "kick off the fetch, settle on completion" and never calls
  // setState synchronously itself.
  const goPrev = () => {
    setSelectedDate(null)
    setHoveredDate(null)
    setLoading(true)
    setError(null)
    if (viewMonth === 1) {
      setViewYear(y => y - 1)
      setViewMonth(12)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const goNext = () => {
    if (isCurrentMonth) return
    setSelectedDate(null)
    setHoveredDate(null)
    setLoading(true)
    setError(null)
    if (viewMonth === 12) {
      setViewYear(y => y + 1)
      setViewMonth(1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const dayByDate = useMemo(() => {
    const m = new Map<string, CalendarDay>()
    calendar?.days.forEach(d => m.set(d.date, d))
    return m
  }, [calendar])

  const activeDate = hoveredDate ?? selectedDate
  const activeDay = activeDate ? dayByDate.get(activeDate) : undefined
  const hasAnyData = calendar?.days.some(d => d.hasData) ?? false
  const leadingBlanks = mondayFirstWeekday(viewYear, viewMonth)
  const total = leadingBlanks + (calendar?.days.length ?? 0)

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'Escape') {
      setSelectedDate(null)
      return
    }

    const cols = 7
    const rowStart = index - (index % cols)
    const rowEnd = Math.min(rowStart + cols - 1, total - 1)

    const tryFocus = (start: number, step: number) => {
      let i = start
      while (i >= 0 && i < total) {
        const el = cellRefs.current.get(i)
        if (el) {
          el.focus()
          return
        }
        i += step
      }
    }

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        tryFocus(index + 1, 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        tryFocus(index - 1, -1)
        break
      case 'ArrowDown':
        e.preventDefault()
        tryFocus(index + cols, 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        tryFocus(index - cols, -1)
        break
      case 'Home':
        e.preventDefault()
        tryFocus(rowStart, 1)
        break
      case 'End':
        e.preventDefault()
        tryFocus(rowEnd, -1)
        break
      default:
        return
    }
  }

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      {/* No inner "Daily Progress" heading here - the Insights page already
          gives this section that exact h2 immediately above the card, and
          repeating it here read as duplicated text rather than helpful
          context. Just the month navigator, which stays meaningful on its
          own since the outer heading already established what it's part of. */}
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous month"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <span className="font-mono tabular-nums text-sm font-bold text-foreground min-w-[7rem] text-center">
          {monthLabel(viewYear, viewMonth)}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={isCurrentMonth}
          aria-label="Next month"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {(['excellent', 'good', 'partial', 'low', 'verylow', 'none'] as const).map(tier => (
          <span key={tier} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${TIER_STYLES[tier].dot}`} />
            {tier === 'excellent' && <span aria-hidden="true">🎯 </span>}
            {TIER_STYLES[tier].label}
          </span>
        ))}
      </div>

      {loading ? (
        <CalendarSkeleton />
      ) : error ? (
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : calendar ? (
        <>
          <div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              {WEEKDAY_HEADERS.map(w => (
                <div key={w} className="text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} aria-hidden="true" />
              ))}
              {calendar.days.map((day, i) => {
                const index = leadingBlanks + i
                const dayNum = i + 1
                const tier = adherenceTier(day.adherencePct)
                const style = TIER_STYLES[tier]
                const isToday = day.date === todayLocal
                const isFuture = day.date > todayLocal
                const isSelected = selectedDate === day.date
                const isPerfect = day.hasData && day.adherencePct === 100

                let ringClass = ''
                if (isSelected) ringClass = 'ring-2 ring-foreground ring-offset-1 ring-offset-surface'
                else if (isToday) ringClass = 'ring-2 ring-primary/70'

                return (
                  <button
                    key={day.date}
                    ref={el => {
                      if (el) cellRefs.current.set(index, el)
                      else cellRefs.current.delete(index)
                    }}
                    type="button"
                    onMouseEnter={() => setHoveredDate(day.date)}
                    onMouseLeave={() => setHoveredDate(null)}
                    onFocus={() => setHoveredDate(day.date)}
                    onBlur={() => setHoveredDate(null)}
                    onClick={() => setSelectedDate(prev => (prev === day.date ? null : day.date))}
                    onKeyDown={e => handleGridKeyDown(e, index)}
                    aria-pressed={isSelected}
                    aria-label={cellAriaLabel(day, isToday)}
                    className={`relative aspect-square rounded-control border flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface hover:brightness-110 ${style.bg} ${style.border} ${isFuture ? 'opacity-40' : ''} ${ringClass}`}
                  >
                    <span
                      className={`text-[9px] sm:text-[10px] font-semibold tabular-nums leading-none ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {dayNum}
                    </span>
                    {isPerfect && (
                      <span className="absolute top-0.5 right-1 text-[9px] sm:text-[10px] leading-none" aria-hidden="true">
                        🏆
                      </span>
                    )}
                    <span className={`font-mono tabular-nums text-[10px] sm:text-sm font-bold leading-none ${style.text}`}>
                      {day.hasData ? `${day.adherencePct}%` : '—'}
                    </span>
                    {isToday && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {!hasAnyData && (
            <p className="text-sm text-muted-foreground text-center">
              No days tracked in {monthLabel(viewYear, viewMonth)} yet.{' '}
              {isCurrentMonth && (
                <>
                  <Link href="/dashboard" className="text-primary hover:text-primary-strong font-semibold">
                    Complete meals on your Dashboard
                  </Link>{' '}
                  to fill this in.
                </>
              )}
            </p>
          )}

          <div className="pt-4 border-t border-border">
            <DayDetail day={activeDay} dateStr={activeDate} />
          </div>
        </>
      ) : null}
    </Card>
  )
}
