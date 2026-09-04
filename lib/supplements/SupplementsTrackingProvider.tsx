'use client'

// Single shared source of truth for "today's supplement dose tracking",
// consumed by BOTH the Dashboard's compact progress card (rendered inside
// DailyProgress, near Protein/Carbs/Fat) and the full Supplements list
// (SupplementsSection) - two separate places in the component tree that
// must never drift out of sync. Mirrors DietEditor's own fetch pattern for
// food tracking (getTodayTracking via useLocalDate + useEffect on mount/
// date-change) rather than a server-side initial fetch: this app has no
// stored per-user timezone, so "today" is only ever known client-side (see
// lib/tracking/date.ts's header comment) - fetching this server-side in
// page.tsx would risk showing the wrong day for a user whose local date
// differs from the server's.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getTodaySupplementTracking, toggleSupplementDose, type SupplementTrackingSummary } from './trackingActions'
import { computeSupplementProgress } from './tracking'
import { useLocalDate } from '@/lib/tracking/useLocalDate'

interface SupplementsTrackingContextValue {
  summary: SupplementTrackingSummary | null
  loading: boolean
  error: string | null
  toggleDose: (supplementId: string, scheduledTime: string, completed: boolean) => Promise<void>
  refresh: () => Promise<void>
}

const SupplementsTrackingContext = createContext<SupplementsTrackingContextValue | null>(null)

// Reuses computeSupplementProgress (lib/supplements/tracking.ts) for the
// rollup - the SAME formula the server uses, never a second hand-rolled
// percentage calculation, so an optimistic update and the server's
// eventually-confirmed response can never disagree on how a given dose list
// maps to a percentage.
function recomputeLocally(summary: SupplementTrackingSummary, supplementId: string, scheduledTime: string, completed: boolean): SupplementTrackingSummary {
  const doses = summary.doses.map(d =>
    d.supplementId === supplementId && d.scheduledTime === scheduledTime ? { ...d, completed } : d
  )
  return { ...summary, doses, ...computeSupplementProgress(doses) }
}

export function SupplementsTrackingProvider({ children }: { children: React.ReactNode }) {
  const localDate = useLocalDate()
  const [summary, setSummary] = useState<SupplementTrackingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTodaySupplementTracking(localDate).then(result => {
      if (cancelled) return
      if ('error' in result) {
        setError(result.error)
      } else {
        setError(null)
        setSummary(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate])

  const refresh = useCallback(async () => {
    const result = await getTodaySupplementTracking(localDate)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    setSummary(result.data)
  }, [localDate])

  const toggleDose = useCallback(
    async (supplementId: string, scheduledTime: string, completed: boolean) => {
      // Optimistic: the checkbox/pill must respond instantly (spec: "must
      // update immediately... do not require a full page reload"), rolled
      // back to the server-confirmed truth if the request fails.
      const previous = summary
      setSummary(prev => (prev ? recomputeLocally(prev, supplementId, scheduledTime, completed) : prev))
      setError(null)

      const result = await toggleSupplementDose(supplementId, scheduledTime, localDate, completed)
      if ('error' in result) {
        setSummary(previous)
        setError(result.error)
        return
      }
      setSummary(result.data)
    },
    [localDate, summary]
  )

  const value = useMemo(
    () => ({ summary, loading, error, toggleDose, refresh }),
    [summary, loading, error, toggleDose, refresh]
  )

  return <SupplementsTrackingContext.Provider value={value}>{children}</SupplementsTrackingContext.Provider>
}

export function useSupplementsTracking(): SupplementsTrackingContextValue {
  const ctx = useContext(SupplementsTrackingContext)
  if (!ctx) throw new Error('useSupplementsTracking must be used within a SupplementsTrackingProvider')
  return ctx
}
