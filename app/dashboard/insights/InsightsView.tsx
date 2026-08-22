'use client'

import { useEffect, useState } from 'react'
import { getWeeklyTracking, getMonthlyTracking, type PeriodTrackingSummary } from '../tracking-actions'
import Card from '@/components/ui/Card'
import { AlertIcon, CalendarIcon } from '@/components/ui/icons'
import DailyProgressCalendar from './DailyProgressCalendar'

type Tab = 'week' | 'month'

function MetricRow({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
        <div className="h-1.5 flex-1 rounded-full bg-surface-elevated border border-border overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-300 ${colorClass}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono tabular-nums text-sm font-semibold text-foreground w-12 text-right">{value}%</span>
      </div>
    </div>
  )
}

// Owns its own fetch for one period. Week and month are two permanently
// separate instances (see InsightsView below) rather than one panel
// switched by a tab, so each fetches and renders completely independently -
// a slow/erroring month never blocks or clears the week section.
function PeriodPanel({ tab }: { tab: Tab }) {
  const [data, setData] = useState<PeriodTrackingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const fetcher = tab === 'week' ? getWeeklyTracking() : getMonthlyTracking(now.getFullYear(), now.getMonth() + 1)
    fetcher.then(result => {
      if (cancelled) return
      if ('error' in result) setError(result.error)
      else setData(result.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tab])

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg bg-surface border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-lg">
        <AlertIcon size={18} className="shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    )
  }

  if (!data) return null

  if (data.daysWithData === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-semibold text-foreground">No tracking data yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Complete meals on your Dashboard to start seeing {tab === 'week' ? 'weekly' : 'monthly'} progress here.
        </p>
      </Card>
    )
  }

  return (
    <>
      <Card className="p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-foreground">
          {tab === 'week' ? 'Weekly Nutrition' : 'Monthly Nutrition'} <span aria-hidden="true">🥗</span>
        </h2>
        <MetricRow label="Calories" value={data.averages.calories} colorClass="bg-calories" />
        <MetricRow label="Protein" value={data.averages.protein} colorClass="bg-protein" />
        <MetricRow label="Carbs" value={data.averages.carbs} colorClass="bg-carbs" />
        <MetricRow label="Fat" value={data.averages.fat} colorClass="bg-fat" />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Meal Adherence
          </div>
          {data.mealAdherence === null ? (
            <p className="text-sm text-muted-foreground">Not enough data yet</p>
          ) : (
            <div className="font-mono tabular-nums text-3xl font-bold text-foreground">{data.mealAdherence}%</div>
          )}
        </Card>
        <Card className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Days on Target
          </div>
          <div className="font-mono tabular-nums text-3xl font-bold text-foreground">
            {data.daysOnTarget}
            <span className="text-muted-foreground text-lg font-normal"> / {data.totalDays}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.daysWithData} of {data.totalDays} days tracked
          </p>
        </Card>
      </div>
    </>
  )
}

type SectionHeaderProps = { title: string; description: string; icon?: React.ReactNode }

// One consistent heading treatment per section (matches the Dashboard
// page's own h2 style: font-display text-2xl font-bold tracking-tight,
// border-b border-border pb-4) so Weekly Insights, Monthly Insights, and
// Daily Progress read as three parallel, equally-weighted views of the same
// page - not one primary view with two features bolted on beside it.
function SectionHeader({ title, description, icon }: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-2 border-b border-border pb-4">
      {icon}
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  )
}

// Weekly Insights, Monthly Insights, and Daily Progress are three always-
// visible, independently-scannable sections - not tabs hiding one behind
// the other. A user landing on /dashboard/insights sees the full shape of
// what this page covers without an extra click, matching the "Dashboard ->
// Insights -> Weekly / Monthly / Daily Progress" journey this page exists
// to make obvious.
export default function InsightsView() {
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-label="Weekly Insights">
        <SectionHeader title="Weekly Insights" description="Your nutrition performance over the last 7 days." />
        <PeriodPanel tab="week" />
      </section>

      <section className="space-y-4" aria-label="Monthly Insights">
        <SectionHeader title="Monthly Insights" description="Your performance and trends this month." />
        <PeriodPanel tab="month" />
      </section>

      <section className="space-y-4" aria-label="Daily Progress">
        <SectionHeader
          title="Daily Progress"
          description="Every day this month, and how close you came to your targets."
          icon={<CalendarIcon size={22} className="text-muted-foreground mt-1 shrink-0" />}
        />
        <DailyProgressCalendar />
      </section>
    </div>
  )
}
