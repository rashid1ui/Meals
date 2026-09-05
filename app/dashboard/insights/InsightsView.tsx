'use client'

import { useEffect, useState } from 'react'
import { getTodayTracking, getWeeklyTracking, getMonthlyTracking, type PeriodTrackingSummary, type DailyTrackingSummary } from '../tracking-actions'
import { useLocalDate } from '@/lib/tracking/useLocalDate'
import type { TrainingTime } from '@/lib/nutrition/workoutMeals'
import type { Goal } from '@/lib/nutrition/engine'
import Card from '@/components/ui/Card'
import { AlertIcon, CalendarIcon } from '@/components/ui/icons'
import DailyProgressCalendar from './DailyProgressCalendar'
import OutsidePlanInsights from './OutsidePlanInsights'
import ProteinBreakdownCard from '../components/ProteinBreakdownCard'
import WorkoutMealRecommendations from '../components/WorkoutMealRecommendations'

type Tab = 'week' | 'month'

interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type Props = {
  targets: Targets | null
  trainingTime: TrainingTime | null
  trainingTimeCustom: string | null
  goal: Goal | null
}

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
          <div key={i} className="h-12 rounded-control bg-surface border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
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

// Today's nutrition analytics panel - fetches daily tracking once on mount
// and renders the ProteinBreakdownCard + WorkoutMealRecommendations that
// were moved here from DietEditor. Same data source (getTodayTracking),
// same calculation pattern - just a different rendering location.
function TodayNutritionAnalytics({ targets, trainingTime, trainingTimeCustom, goal }: Props) {
  // useLocalDate (not a frozen useState lazy initializer) - stays correct
  // across a session left open past midnight; the effect below already
  // re-fetches whenever this value changes.
  const localDate = useLocalDate()
  const [dailyTracking, setDailyTracking] = useState<DailyTrackingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTodayTracking(localDate).then(result => {
      if (cancelled) return
      if ('error' in result) setError(result.error)
      else setDailyTracking(result.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate])

  if (loading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="h-52 rounded-card bg-surface border border-border animate-pulse" />
        <div className="h-52 rounded-card bg-surface border border-border animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
        <AlertIcon size={18} className="shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    )
  }

  if (!dailyTracking || !targets) return null

  const remainingProtein = Math.max(0, targets.protein - dailyTracking.consumed.protein)
  const remainingCalories = Math.max(0, targets.calories - dailyTracking.consumed.calories)

  return (
    <div className={trainingTime ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
      <ProteinBreakdownCard breakdown={dailyTracking.proteinBreakdown} target={targets.protein} />
      <WorkoutMealRecommendations
        trainingTime={trainingTime}
        trainingTimeCustom={trainingTimeCustom}
        goal={goal}
        remainingProtein={remainingProtein}
        remainingCalories={remainingCalories}
      />
    </div>
  )
}

// Weekly Insights, Monthly Insights, Daily Progress, and the new Protein
// Analytics / Workout Nutrition sections are all always-visible,
// independently-scannable sections - not tabs hiding one behind the other.
// Protein analytics at the top, workout nutrition below it, then the
// existing weekly/monthly/calendar sections.
export default function InsightsView({ targets, trainingTime, trainingTimeCustom, goal }: Props) {
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-label="Protein Analytics & Workout Nutrition">
        <SectionHeader
          title="Today's Nutrition Analytics"
          description="Protein breakdown by source and workout meal recommendations based on your goals."
        />
        <TodayNutritionAnalytics
          targets={targets}
          trainingTime={trainingTime}
          trainingTimeCustom={trainingTimeCustom}
          goal={goal}
        />
      </section>

      <section className="space-y-4" aria-label="Outside-Plan Insights">
        <SectionHeader
          title="Outside-Plan Insights"
          description="Patterns in food you logged outside your plan. Neutral, data-only — not a judgement."
        />
        <OutsidePlanInsights />
      </section>

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

