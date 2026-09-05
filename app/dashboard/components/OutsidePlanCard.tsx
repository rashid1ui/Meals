'use client'

// Dashboard section for outside-plan food (Phase 5). Lists what the user
// has logged today that was NOT part of the plan, with an entry point to
// the scanner. Deliberately separate from the planned-meal tracker
// (DietEditor) - an outside-plan entry is additive tracking and never
// touches a planned meal.

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { AppleIcon, PlusIcon, CloseIcon } from '@/components/ui/icons'
import { useLocalDate } from '@/lib/tracking/useLocalDate'
import { getOutsidePlanFoodLog, deleteOutsidePlanEntry, type OutsidePlanLogEntry } from '../outside-plan-actions'

export default function OutsidePlanCard() {
  const localDate = useLocalDate()
  const [entries, setEntries] = useState<OutsidePlanLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => {
    getOutsidePlanFoodLog(localDate).then(result => {
      if ('error' in result) {
        setError(result.error)
        setEntries([])
      } else {
        setError(null)
        setEntries(result.data)
      }
    })
  }, [localDate])

  useEffect(() => {
    load()
    // Re-check when the tab regains focus - the scanner runs on its own
    // route, so a confirm there is only reflected here on return.
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteOutsidePlanEntry(id, localDate)
      if ('error' in result) setError(result.error)
      else load()
    })
  }

  const total = (entries ?? []).reduce((n, e) => n + e.calories, 0)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">Outside-Plan Food</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Anything you ate today that wasn&apos;t part of your plan. Added to today&apos;s totals only.
          </p>
        </div>
        <Link href="/dashboard/scan" className="shrink-0">
          <Button type="button" size="sm">
            <PlusIcon size={16} />
            Log food
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="p-4">
          <p className="text-sm text-error">{error}</p>
        </Card>
      )}

      {entries === null ? (
        <div className="h-20 rounded-card bg-surface border border-border animate-pulse" aria-hidden="true" />
      ) : entries.length === 0 ? (
        <Card className="p-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-chip bg-surface-elevated border border-border">
            <AppleIcon size={18} className="text-primary" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">Nothing logged outside your plan today</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ate something off-plan?{' '}
            <Link href="/dashboard/scan" className="font-semibold text-primary hover:underline">
              Snap a photo
            </Link>{' '}
            and we&apos;ll estimate it.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <Card key={entry.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{entry.itemName}</p>
                  {entry.mealContext && <Badge variant="neutral">{entry.mealContext}</Badge>}
                  {entry.wasEdited && <Badge variant="neutral">Edited</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.itemCount > 0 ? `${entry.itemCount} item${entry.itemCount === 1 ? '' : 's'} · ` : ''}
                  <span className="font-mono tabular-nums">{Math.round(entry.calories)} kcal</span>
                  {' · '}
                  <span className="font-mono tabular-nums text-protein">{Math.round(entry.protein)}g P</span>{' '}
                  <span className="font-mono tabular-nums text-carbs">{Math.round(entry.carbs)}g C</span>{' '}
                  <span className="font-mono tabular-nums text-fat">{Math.round(entry.fat)}g F</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(entry.id)}
                disabled={pending}
                aria-label={`Remove ${entry.itemName}`}
                className="shrink-0 text-muted-foreground hover:text-error transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary p-1 disabled:opacity-50"
              >
                <CloseIcon size={16} />
              </button>
            </Card>
          ))}
          <p className="text-right text-sm text-muted-foreground">
            Outside-plan total today:{' '}
            <span className="font-mono tabular-nums font-bold text-calories">{Math.round(total)} kcal</span>
          </p>
        </div>
      )}
    </section>
  )
}
