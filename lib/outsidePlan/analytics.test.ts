import test from 'node:test'
import assert from 'node:assert'
import {
  buildOutsidePlanAnalytics,
  computeOutsidePlanPercent,
  computeTrend,
  datesInRange,
  deriveDailyPoints,
  rankTopFoods,
  type DailySnapshotInput,
  type OutsidePlanAnalyticsInput,
  type OutsidePlanComponentInput,
  type OutsidePlanEntryInput
} from './analytics'

// A fixed 7-day window: 2026-09-01 .. 2026-09-07
const START = '2026-09-01'
const END = '2026-09-07'

function comp(over: Partial<OutsidePlanComponentInput> = {}): OutsidePlanComponentInput {
  return { name: 'Item', source: 'manual', calories: 100, protein: 5, carbs: 10, fat: 3, ...over }
}

function entry(over: Partial<OutsidePlanEntryInput> = {}): OutsidePlanEntryInput {
  return {
    id: `e_${Math.random().toString(36).slice(2)}`,
    trackingDate: '2026-09-03',
    loggedAt: '2026-09-03T12:00:00Z',
    source: 'ai_scan',
    wasEdited: false,
    mealContext: null,
    calories: 300,
    protein: 12,
    carbs: 30,
    fat: 14,
    components: [comp()],
    ...over
  }
}

function snapshot(
  date: string,
  total: DailySnapshotInput['total'],
  outsidePlan: DailySnapshotInput['outsidePlan']
): DailySnapshotInput {
  return { trackingDate: date, total, outsidePlan }
}

function input(over: Partial<OutsidePlanAnalyticsInput> = {}): OutsidePlanAnalyticsInput {
  return { rangeStart: START, rangeEnd: END, entries: [], snapshots: [], hasActivePlan: true, ...over }
}

// ---- A. Empty period ----

test('A. empty period - isEmpty, all zero, insufficient trend, no comparison', () => {
  const a = buildOutsidePlanAnalytics(input())
  assert.strictEqual(a.isEmpty, true)
  assert.strictEqual(a.summary.entryCount, 0)
  assert.strictEqual(a.summary.outsidePlanCalories, 0)
  assert.strictEqual(a.summary.outsidePlanPercent, null)
  assert.strictEqual(a.summary.avgCaloriesPerEntry, null)
  assert.strictEqual(a.summary.avgCaloriesPerOutsidePlanDay, null)
  assert.strictEqual(a.summary.trend, 'insufficient')
  assert.deepStrictEqual(a.topFoods, [])
  assert.strictEqual(a.plannedVsOutside.available, false)
  assert.strictEqual(a.macros.trueConsumed, null)
  assert.strictEqual(a.daily.length, 7)
})

// ---- B. Single entry ----

test('B. single entry - totals reflect exactly that entry', () => {
  const a = buildOutsidePlanAnalytics(input({ entries: [entry({ calories: 420, protein: 20, carbs: 40, fat: 18 })] }))
  assert.strictEqual(a.isEmpty, false)
  assert.strictEqual(a.summary.entryCount, 1)
  assert.strictEqual(a.summary.outsidePlanCalories, 420)
  assert.strictEqual(a.summary.outsidePlanProtein, 20)
  assert.strictEqual(a.summary.daysWithOutsidePlan, 1)
  assert.strictEqual(a.summary.avgCaloriesPerEntry, 420)
  assert.strictEqual(a.summary.avgCaloriesPerOutsidePlanDay, 420)
})

// ---- C. Multiple entries (same + different days) ----

test('C. multiple entries on the same day sum into that day and the period', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      entries: [entry({ trackingDate: '2026-09-03', calories: 200 }), entry({ trackingDate: '2026-09-03', calories: 150 })]
    })
  )
  assert.strictEqual(a.summary.entryCount, 2)
  assert.strictEqual(a.summary.outsidePlanCalories, 350)
  assert.strictEqual(a.summary.daysWithOutsidePlan, 1)
  const day3 = a.daily.find(d => d.date === '2026-09-03')!
  assert.strictEqual(day3.entryCount, 2)
  assert.strictEqual(day3.outsidePlanCalories, 350)
})

// ---- D. Multiple components inside one entry ----

test('D. a single entry with several components contributes each component to top foods, once each', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      entries: [
        entry({
          id: 'multi',
          components: [comp({ name: 'Pizza', calories: 600 }), comp({ name: 'Coke', calories: 150 }), comp({ name: 'Wings', calories: 400 })]
        })
      ]
    })
  )
  assert.strictEqual(a.topFoods.length, 3)
  for (const f of a.topFoods) {
    assert.strictEqual(f.occurrences, 1)
    assert.strictEqual(f.entryCount, 1)
  }
})

// ---- E / F / G. Ranges ----

test('F. a 7-day range produces 7 daily points, first = start, last = end', () => {
  const a = buildOutsidePlanAnalytics(input())
  assert.strictEqual(a.daily.length, 7)
  assert.strictEqual(a.daily[0].date, START)
  assert.strictEqual(a.daily[6].date, END)
  assert.strictEqual(a.period.days, 7)
})

test('G. a 30-day range produces 30 daily points', () => {
  const a = buildOutsidePlanAnalytics(input({ rangeStart: '2026-08-09', rangeEnd: '2026-09-07' }))
  assert.strictEqual(a.daily.length, 30)
  assert.strictEqual(a.daily[0].date, '2026-08-09')
  assert.strictEqual(a.daily[29].date, '2026-09-07')
})

test('E. datesInRange crosses a month boundary correctly', () => {
  assert.deepStrictEqual(datesInRange('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'])
})

// ---- H / I. Calorie + macro totals ----

test('H/I. period totals are the sum of entry values across days', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      entries: [
        entry({ trackingDate: '2026-09-02', calories: 300, protein: 10, carbs: 30, fat: 12 }),
        entry({ trackingDate: '2026-09-05', calories: 500, protein: 25, carbs: 50, fat: 20 })
      ]
    })
  )
  assert.strictEqual(a.summary.outsidePlanCalories, 800)
  assert.strictEqual(a.summary.outsidePlanProtein, 35)
  assert.strictEqual(a.summary.outsidePlanCarbs, 80)
  assert.strictEqual(a.summary.outsidePlanFat, 32)
  assert.strictEqual(a.macros.outsidePlan.calories, 800)
})

// ---- J. Outside-plan percentage formula ----

test('J. outside-plan % = outside / (planned + outside), NOT outside / target', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      rangeStart: '2026-09-03',
      rangeEnd: '2026-09-03',
      entries: [entry({ trackingDate: '2026-09-03', calories: 300, protein: 0, carbs: 0, fat: 0 })],
      snapshots: [snapshot('2026-09-03', { calories: 1800, protein: 140, carbs: 150, fat: 55 }, { calories: 0, protein: 0, carbs: 0, fat: 0 })]
    })
  )
  const pct = a.summary.outsidePlanPercent!
  assert.ok(Math.abs(pct - (300 / 2100) * 100) < 1e-9, `got ${pct}`)
  assert.ok(Math.abs(pct - 14.285714285714285) < 1e-9)
})

// ---- K. Planned + outside denominator uses snapshot planned, not daily_tracking.calories directly ----

test('K. trueConsumed = snapshot planned portion + entries outside, even if the snapshot total is stale', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      rangeStart: '2026-09-03',
      rangeEnd: '2026-09-03',
      entries: [entry({ trackingDate: '2026-09-03', calories: 200, protein: 0, carbs: 0, fat: 0, components: [] })],
      snapshots: [snapshot('2026-09-03', { calories: 2100, protein: 0, carbs: 0, fat: 0 }, { calories: 300, protein: 0, carbs: 0, fat: 0 })]
    })
  )
  const day = a.daily[0]
  assert.strictEqual(day.plannedConsumedCalories, 1800) // 2100 - 300
  assert.strictEqual(day.outsidePlanCalories, 200)
  assert.strictEqual(day.trueConsumedCalories, 2000)
  assert.ok(Math.abs(day.outsidePlanPercent! - 10) < 1e-9)
})

// ---- L. Outside-plan-only day ----

test('L. outside-plan-only day (snapshot total == outside_plan) -> planned 0, 100%', () => {
  const a = deriveDailyPoints(
    input({
      rangeStart: '2026-09-04',
      rangeEnd: '2026-09-04',
      entries: [entry({ trackingDate: '2026-09-04', calories: 500 })],
      snapshots: [snapshot('2026-09-04', { calories: 500, protein: 20, carbs: 0, fat: 0 }, { calories: 500, protein: 20, carbs: 0, fat: 0 })]
    })
  )
  assert.strictEqual(a[0].plannedConsumedCalories, 0)
  assert.strictEqual(a[0].trueConsumedCalories, 500)
  assert.strictEqual(a[0].outsidePlanPercent, 100)
  assert.strictEqual(a[0].hasOutsidePlan, true)
  assert.strictEqual(a[0].hasTracking, true)
})

// ---- M. Planned-only day ----

test('M. planned-only day -> outside 0, hasOutsidePlan false, hasTracking true', () => {
  const a = deriveDailyPoints(
    input({
      rangeStart: '2026-09-04',
      rangeEnd: '2026-09-04',
      entries: [],
      snapshots: [snapshot('2026-09-04', { calories: 1900, protein: 150, carbs: 160, fat: 60 }, { calories: 0, protein: 0, carbs: 0, fat: 0 })]
    })
  )
  assert.strictEqual(a[0].outsidePlanCalories, 0)
  assert.strictEqual(a[0].hasOutsidePlan, false)
  assert.strictEqual(a[0].hasTracking, true)
  assert.strictEqual(a[0].plannedConsumedCalories, 1900)
  assert.strictEqual(a[0].outsidePlanPercent, 0)
})

// ---- N. Untracked day ----

test('N. a day with no snapshot and no entries is not tracked, distinct from a 0 day', () => {
  const a = deriveDailyPoints(input({ rangeStart: '2026-09-04', rangeEnd: '2026-09-04' }))
  assert.strictEqual(a[0].hasTracking, false)
  assert.strictEqual(a[0].hasOutsidePlan, false)
  assert.strictEqual(a[0].outsidePlanPercent, null)
  assert.strictEqual(a[0].trueConsumedCalories, 0)
})

// ---- O. Deleted entry exclusion ----

test('O. a deleted entry is simply absent from the input and analytics update automatically', () => {
  const kept = entry({ id: 'kept', trackingDate: '2026-09-02', calories: 300 })
  const deleted = entry({ id: 'deleted', trackingDate: '2026-09-02', calories: 900 })
  const withBoth = buildOutsidePlanAnalytics(input({ entries: [kept, deleted] }))
  const afterDelete = buildOutsidePlanAnalytics(input({ entries: [kept] }))
  assert.strictEqual(withBoth.summary.outsidePlanCalories, 1200)
  assert.strictEqual(afterDelete.summary.outsidePlanCalories, 300)
  assert.strictEqual(afterDelete.summary.entryCount, 1)
})

// ---- P. Top foods ranking ----

test('P. top foods ranked by occurrences, then calories, then name; capped at the limit', () => {
  const entries: OutsidePlanEntryInput[] = [
    entry({ id: 'a', components: [comp({ name: 'Pizza', calories: 700 })] }),
    entry({ id: 'b', components: [comp({ name: 'Pizza', calories: 650 })] }),
    entry({ id: 'c', components: [comp({ name: 'Pizza', calories: 700 })] }),
    entry({ id: 'd', components: [comp({ name: 'Burger', calories: 500 })] }),
    entry({ id: 'e', components: [comp({ name: 'Burger', calories: 500 })] }),
    entry({ id: 'f', components: [comp({ name: 'Fries', calories: 400 })] }),
    entry({ id: 'g', components: [comp({ name: 'Soda', calories: 150 })] })
  ]
  const ranked = rankTopFoods(entries)
  assert.strictEqual(ranked[0].name, 'Pizza')
  assert.strictEqual(ranked[0].occurrences, 3)
  assert.strictEqual(ranked[0].entryCount, 3)
  assert.strictEqual(ranked[0].totalCalories, 2050)
  assert.strictEqual(ranked[1].name, 'Burger')
  assert.strictEqual(ranked[1].occurrences, 2)
  assert.strictEqual(ranked[2].name, 'Fries') // 400 > 150
  assert.strictEqual(ranked[3].name, 'Soda')
})

test('P. top foods is limited', () => {
  const entries = Array.from({ length: 20 }, (_, i) => entry({ id: `x${i}`, components: [comp({ name: `Food ${i}` })] }))
  assert.strictEqual(rankTopFoods(entries).length, 8)
  assert.strictEqual(rankTopFoods(entries, 3).length, 3)
})

// ---- Q. Duplicate component handling ----

test('Q. two components with the same name in ONE entry -> occurrences 2 but entryCount 1', () => {
  const ranked = rankTopFoods([entry({ id: 'dup', components: [comp({ name: 'Fries' }), comp({ name: 'fries' })] })])
  assert.strictEqual(ranked.length, 1)
  assert.strictEqual(ranked[0].name, 'Fries')
  assert.strictEqual(ranked[0].occurrences, 2)
  assert.strictEqual(ranked[0].entryCount, 1)
})

test('Q. a blank/whitespace component name is ignored, never counted', () => {
  const ranked = rankTopFoods([entry({ id: 'blank', components: [comp({ name: '   ' }), comp({ name: 'Real Food' })] })])
  assert.strictEqual(ranked.length, 1)
  assert.strictEqual(ranked[0].name, 'Real Food')
})

// ---- R. Manual vs matched provenance ----

test('R. provenance counts ai_scan vs manual entries and matched vs manual components', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      entries: [
        entry({ id: 's1', source: 'ai_scan', components: [comp({ name: 'A', source: 'matched' }), comp({ name: 'B', source: 'manual' })] }),
        entry({ id: 'm1', source: 'manual', components: [comp({ name: 'C', source: 'manual' })] })
      ]
    })
  )
  assert.strictEqual(a.provenance.aiScanEntries, 1)
  assert.strictEqual(a.provenance.manualEntries, 1)
  assert.strictEqual(a.provenance.matchedComponents, 1)
  assert.strictEqual(a.provenance.manualComponents, 2)
})

// ---- S. Date boundaries ----

test('S. entries on the first and last day of the range are both included', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      entries: [entry({ id: 'first', trackingDate: START, calories: 100 }), entry({ id: 'last', trackingDate: END, calories: 200 })]
    })
  )
  assert.strictEqual(a.summary.outsidePlanCalories, 300)
  assert.strictEqual(a.daily[0].outsidePlanCalories, 100)
  assert.strictEqual(a.daily[6].outsidePlanCalories, 200)
})

// ---- T. No-active-plan behavior ----

test('T. no active plan -> absolute intake still shown, planned-vs-outside comparison omitted', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      hasActivePlan: false,
      rangeStart: '2026-09-03',
      rangeEnd: '2026-09-03',
      entries: [entry({ trackingDate: '2026-09-03', calories: 450 })],
      snapshots: [snapshot('2026-09-03', { calories: 450, protein: 18, carbs: 0, fat: 0 }, { calories: 450, protein: 18, carbs: 0, fat: 0 })]
    })
  )
  assert.strictEqual(a.summary.outsidePlanCalories, 450)
  assert.strictEqual(a.plannedVsOutside.available, false)
  assert.strictEqual(a.summary.outsidePlanPercent, 100)
  assert.strictEqual(a.macros.trueConsumed?.calories, 450)
})

// ---- U. Zero totals / division by zero ----

test('U. computeOutsidePlanPercent returns null when nothing was consumed', () => {
  assert.strictEqual(computeOutsidePlanPercent(0, 0), null)
  assert.strictEqual(computeOutsidePlanPercent(100, 0), null)
  assert.strictEqual(computeOutsidePlanPercent(0, 2000), 0)
})

test('U. an all-zero-calorie entry does not divide by zero', () => {
  const a = buildOutsidePlanAnalytics(input({ entries: [entry({ calories: 0, protein: 0, carbs: 0, fat: 0, components: [] })] }))
  assert.strictEqual(a.summary.avgCaloriesPerEntry, 0)
  assert.strictEqual(a.summary.outsidePlanPercent, null)
})

// ---- V. Rounding (calculate first, round at the boundary) ----

test('V. the pure layer keeps full precision - percentages are not pre-rounded', () => {
  const pct = computeOutsidePlanPercent(1, 3)
  assert.ok(pct !== null && Math.abs(pct - 33.33333333333333) < 1e-9)
})

test('V. averages keep full precision', () => {
  const c = buildOutsidePlanAnalytics(
    input({ entries: [entry({ calories: 100 }), entry({ calories: 50 }), entry({ calories: 50 })] })
  )
  assert.ok(Math.abs(c.summary.avgCaloriesPerEntry! - 66.66666666666667) < 1e-9)
})

// ---- Trend ----

test('trend - increasing when later half has clearly more outside-plan calories', () => {
  const entries = [
    entry({ id: 't1', trackingDate: '2026-09-01', calories: 100 }),
    entry({ id: 't2', trackingDate: '2026-09-06', calories: 600 }),
    entry({ id: 't3', trackingDate: '2026-09-07', calories: 700 })
  ]
  assert.strictEqual(buildOutsidePlanAnalytics(input({ entries })).summary.trend, 'increasing')
})

test('trend - decreasing when later half has clearly less', () => {
  const entries = [
    entry({ id: 'd1', trackingDate: '2026-09-01', calories: 700 }),
    entry({ id: 'd2', trackingDate: '2026-09-02', calories: 600 }),
    entry({ id: 'd3', trackingDate: '2026-09-07', calories: 100 })
  ]
  assert.strictEqual(buildOutsidePlanAnalytics(input({ entries })).summary.trend, 'decreasing')
})

test('trend - insufficient with fewer than 2 outside-plan days', () => {
  assert.strictEqual(
    buildOutsidePlanAnalytics(input({ entries: [entry({ trackingDate: '2026-09-03', calories: 300 })] })).summary.trend,
    'insufficient'
  )
})

test('trend - flat when both halves are similar', () => {
  const pts = datesInRange('2026-09-01', '2026-09-08').map(date => ({
    date,
    entryCount: 1,
    outsidePlanCalories: 300,
    outsidePlanProtein: 0,
    outsidePlanCarbs: 0,
    outsidePlanFat: 0,
    plannedConsumedCalories: 0,
    trueConsumedCalories: 300,
    outsidePlanPercent: 100,
    hasTracking: true,
    hasOutsidePlan: true
  }))
  assert.strictEqual(computeTrend(pts), 'flat')
})

// ---- Planned vs outside (period) ----

test('planned-vs-outside uses TRUE consumed and reports a neutral percentage', () => {
  const a = buildOutsidePlanAnalytics(
    input({
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-02',
      entries: [entry({ id: 'p1', trackingDate: '2026-09-01', calories: 640 }), entry({ id: 'p2', trackingDate: '2026-09-02', calories: 640 })],
      snapshots: [
        snapshot('2026-09-01', { calories: 6840, protein: 0, carbs: 0, fat: 0 }, { calories: 640, protein: 0, carbs: 0, fat: 0 }),
        snapshot('2026-09-02', { calories: 6840, protein: 0, carbs: 0, fat: 0 }, { calories: 640, protein: 0, carbs: 0, fat: 0 })
      ]
    })
  )
  assert.strictEqual(a.plannedVsOutside.plannedConsumedCalories, 12400) // (6840-640)*2
  assert.strictEqual(a.plannedVsOutside.outsidePlanCalories, 1280)
  assert.strictEqual(a.plannedVsOutside.trueConsumedCalories, 13680)
  assert.ok(Math.abs(a.plannedVsOutside.outsidePlanPercent! - (1280 / 13680) * 100) < 1e-9)
  assert.strictEqual(a.plannedVsOutside.available, true)
})

test('planned-vs-outside unavailable when there are no snapshots even with an active plan', () => {
  const a = buildOutsidePlanAnalytics(input({ entries: [entry({ calories: 300 })], snapshots: [] }))
  assert.strictEqual(a.plannedVsOutside.available, false)
})
