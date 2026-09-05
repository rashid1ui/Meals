'use client'

// "Outside-Plan Insights" section for the Insights page (Phase 7). Pure
// display layer over getOutsidePlanAnalytics - every number is computed by
// lib/outsidePlan/analytics.ts (pure) on the server; this component only
// picks the period, rounds at the presentation boundary, and lays it out in
// the existing Gym Meals visual language (Card, thin bars, tabular-nums).
//
// Tone is deliberately neutral: "outside plan" is just food that wasn't in
// the planned diet, never framed as a failure.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import { AlertIcon, AppleIcon, TrendingUpIcon } from '@/components/ui/icons'
import { useLocalDate } from '@/lib/tracking/useLocalDate'
import {
  getOutsidePlanAnalytics,
  type GetOutsidePlanAnalyticsResult,
  type OutsidePlanAnalyticsPeriod
} from '../outside-plan-actions'
import type { OutsidePlanAnalytics, OutsidePlanTrend } from '@/lib/outsidePlan/analytics'

function kcal(n: number): string {
  return `${Math.round(n).toLocaleString()} kcal`
}
function grams(n: number): string {
  return `${Math.round(n)} g`
}
function pct1(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`
}

const TREND_COPY: Record<OutsidePlanTrend, { label: string; tone: string }> = {
  increasing: { label: 'Increasing', tone: 'text-foreground' },
  decreasing: { label: 'Decreasing', tone: 'text-foreground' },
  flat: { label: 'Steady', tone: 'text-muted-foreground' },
  insufficient: { label: 'Not enough data', tone: 'text-muted-foreground' }
}

export default function OutsidePlanInsights() {
  const localDate = useLocalDate()
  const [period, setPeriod] = useState<OutsidePlanAnalyticsPeriod>('7d')
  const [data, setData] = useState<GetOutsidePlanAnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getOutsidePlanAnalytics(localDate, period).then(result => {
      if (cancelled) return
      if ('error' in result) {
        setError(result.error)
        setData(null)
      } else {
        setError(null)
        setData(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate, period])

  // Show the skeleton on first load AND while a period switch is still
  // resolving (data still reflects the previous period) - without calling
  // setState synchronously inside the effect above.
  const showLoading = loading || Boolean(data && data.period !== period)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Food you logged outside your plan, and the patterns in it. Added to your intake &mdash; your plan is unchanged.
        </p>
        <div className="inline-flex rounded-pill border border-border p-0.5" role="group" aria-label="Analytics period">
          {(['7d', '30d'] as const).map(p => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`min-h-[36px] px-4 rounded-pill text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                period === p ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === '7d' ? '7D' : '30D'}
            </button>
          ))}
        </div>
      </div>

      {showLoading ? (
        <div className="space-y-3" aria-hidden="true">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-card bg-surface border border-border animate-pulse" />
            ))}
          </div>
          <div className="h-40 rounded-card bg-surface border border-border animate-pulse" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : data && data.analytics.isEmpty ? (
        <EmptyState />
      ) : data ? (
        <AnalyticsBody analytics={data.analytics} />
      ) : null}
    </div>
  )
}

function EmptyState() {
  return (
    <Card className="p-8 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-chip bg-surface-elevated border border-border">
        <AppleIcon size={18} className="text-primary" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">No outside-plan food yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Once you log food outside your plan, you&apos;ll see your patterns here &mdash; how often, how many calories, and
        which foods.
      </p>
      <Link
        href="/dashboard/scan"
        className="mt-4 inline-flex min-h-[40px] items-center px-4 rounded-pill bg-primary/15 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Log outside-plan food
      </Link>
    </Card>
  )
}

function AnalyticsBody({ analytics }: { analytics: OutsidePlanAnalytics }) {
  const s = analytics.summary
  const trend = TREND_COPY[s.trend]

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Outside-plan entries"
          value={String(s.entryCount)}
          sub={`on ${s.daysWithOutsidePlan} of ${s.daysTracked || analytics.period.days} tracked days`}
        />
        <StatCard
          label="Outside-plan calories"
          value={kcal(s.outsidePlanCalories)}
          sub={s.outsidePlanPercent === null ? 'no intake recorded' : `${pct1(s.outsidePlanPercent)} of consumed`}
        />
        <StatCard
          label="Avg per entry"
          value={s.avgCaloriesPerEntry === null ? '—' : kcal(s.avgCaloriesPerEntry)}
          sub={s.avgCaloriesPerOutsidePlanDay === null ? '' : `${kcal(s.avgCaloriesPerOutsidePlanDay)} per outside-plan day`}
        />
        <StatCard
          label="Trend"
          value={trend.label}
          valueClass={trend.tone}
          sub="early vs later in the period"
          icon={<TrendingUpIcon size={16} className="text-muted-foreground" />}
        />
      </div>

      {/* Daily trend */}
      <TrendChart daily={analytics.daily} />

      {/* Planned vs outside plan */}
      {analytics.plannedVsOutside.available ? (
        <PlannedVsOutside pvo={analytics.plannedVsOutside} />
      ) : (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            A planned-vs-outside comparison needs planned-meal tracking in this period. Absolute outside-plan intake is
            shown above.
          </p>
        </Card>
      )}

      {/* Macro breakdown */}
      <MacroBreakdown macros={analytics.macros} />

      {/* Top foods */}
      <TopFoods foods={analytics.topFoods} />

      {/* Provenance */}
      <p className="text-[11px] text-muted-foreground">
        {analytics.provenance.aiScanEntries} AI scan{analytics.provenance.aiScanEntries === 1 ? '' : 's'} ·{' '}
        {analytics.provenance.manualEntries} manual {analytics.provenance.manualEntries === 1 ? 'entry' : 'entries'}
        {analytics.provenance.matchedComponents + analytics.provenance.manualComponents > 0 && (
          <>
            {' · '}
            {analytics.provenance.matchedComponents} item{analytics.provenance.matchedComponents === 1 ? '' : 's'} from
            database, {analytics.provenance.manualComponents} manual
          </>
        )}
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  valueClass = 'text-foreground',
  icon
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon?: React.ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 font-mono tabular-nums text-lg font-bold ${valueClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  )
}

function TrendChart({ daily }: { daily: OutsidePlanAnalytics['daily'] }) {
  const maxCals = Math.max(1, ...daily.map(d => d.outsidePlanCalories))
  const barWidth = daily.length > 10 ? 'w-2' : 'w-6'

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-foreground">Daily outside-plan calories</h4>
        <span className="text-[11px] text-muted-foreground">max {kcal(maxCals)}</span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="flex items-end gap-1 h-32 min-w-full"
          role="img"
          aria-label="Bar chart of outside-plan calories per day"
        >
          {daily.map(d => {
            const heightPct = d.outsidePlanCalories > 0 ? Math.max(4, (d.outsidePlanCalories / maxCals) * 100) : 0
            const title = !d.hasTracking
              ? `${d.date}: no tracking data`
              : d.outsidePlanCalories === 0
                ? `${d.date}: no outside-plan food`
                : `${d.date}: ${kcal(d.outsidePlanCalories)}${
                    d.outsidePlanPercent === null ? '' : ` · ${pct1(d.outsidePlanPercent)} of intake`
                  }`
            return (
              <div key={d.date} className={`${barWidth} shrink-0 h-full flex flex-col justify-end`} title={title}>
                {d.outsidePlanCalories > 0 ? (
                  <div
                    className="w-full rounded-t-sm bg-calories transition-[height] duration-300"
                    style={{ height: `${heightPct}%` }}
                  />
                ) : d.hasTracking ? (
                  <div className="w-full h-[3px] rounded-full bg-border" />
                ) : (
                  <div className="w-full h-[3px] rounded-full border-b border-dashed border-border/60" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-calories" /> outside-plan calories
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-[3px] rounded-full bg-border" /> tracked, none outside plan
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-[3px] rounded-full border-b border-dashed border-border/60" /> no tracking
        </span>
      </div>
    </Card>
  )
}

function PlannedVsOutside({ pvo }: { pvo: OutsidePlanAnalytics['plannedVsOutside'] }) {
  const total = pvo.trueConsumedCalories || 1
  const plannedPct = (pvo.plannedConsumedCalories / total) * 100
  const outsidePct = (pvo.outsidePlanCalories / total) * 100

  return (
    <Card className="p-5 space-y-3">
      <h4 className="text-sm font-bold text-foreground">Planned vs outside plan</h4>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-elevated border border-border">
        <div className="bg-primary/70" style={{ width: `${plannedPct}%` }} aria-hidden="true" />
        <div className="bg-calories" style={{ width: `${outsidePct}%` }} aria-hidden="true" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-muted-foreground">Planned</div>
          <div className="font-mono tabular-nums font-semibold text-foreground">{kcal(pvo.plannedConsumedCalories)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Outside plan</div>
          <div className="font-mono tabular-nums font-semibold text-foreground">{kcal(pvo.outsidePlanCalories)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Consumed</div>
          <div className="font-mono tabular-nums font-semibold text-foreground">{kcal(pvo.trueConsumedCalories)}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {pct1(pvo.outsidePlanPercent)} of your consumed calories this period was food outside your plan.
      </p>
    </Card>
  )
}

function MacroBreakdown({ macros }: { macros: OutsidePlanAnalytics['macros'] }) {
  const rows: { key: 'protein' | 'carbs' | 'fat'; label: string; bar: string }[] = [
    { key: 'protein', label: 'Protein', bar: 'bg-protein' },
    { key: 'carbs', label: 'Carbs', bar: 'bg-carbs' },
    { key: 'fat', label: 'Fat', bar: 'bg-fat' }
  ]
  return (
    <Card className="p-5 space-y-3">
      <h4 className="text-sm font-bold text-foreground">Outside-plan macros</h4>
      <div className="space-y-3">
        {rows.map(r => {
          const outside = macros.outsidePlan[r.key]
          const total = macros.trueConsumed ? macros.trueConsumed[r.key] : null
          const sharePct = total && total > 0 ? Math.min(100, (outside / total) * 100) : 0
          return (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">{r.label}</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {grams(outside)}
                  {total !== null && total > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      / {grams(total)} total ({sharePct.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              {total !== null && total > 0 && (
                <div className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden">
                  <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${sharePct}%` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function TopFoods({ foods }: { foods: OutsidePlanAnalytics['topFoods'] }) {
  if (foods.length === 0) {
    return (
      <Card className="p-4">
        <h4 className="text-sm font-bold text-foreground">Most logged foods</h4>
        <p className="mt-1 text-xs text-muted-foreground">No item-level detail is available for these entries yet.</p>
      </Card>
    )
  }
  return (
    <Card className="p-5 space-y-3">
      <h4 className="text-sm font-bold text-foreground">Most logged foods</h4>
      <ol className="space-y-2">
        {foods.map((f, i) => (
          <li key={f.name} className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex items-center gap-2">
              <span className="font-mono tabular-nums text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
              <span className="truncate text-sm font-semibold text-foreground">{f.name}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums font-semibold text-foreground">{f.occurrences}&times;</span>
              {f.totalCalories > 0 && <> · {kcal(f.totalCalories)}</>}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted-foreground">
        Ranked by how often the food appears across your outside-plan entries.
      </p>
    </Card>
  )
}
