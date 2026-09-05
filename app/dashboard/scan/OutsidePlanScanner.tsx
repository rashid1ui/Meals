'use client'

// The Outside-Plan Food Scanner review + confirm experience (Phase 5).
// A single client-side state machine:
//
//   pick  --analyze-->  analyzing  --ok-->  review  --confirm-->  done
//     ^                     |                  |
//     +----- error ---------+------------------+  (retake / start over)
//
// The scanner is an assistant, not an authority (Phase 5 section 33): every
// AI number is labelled an estimate, unresolved foods must be completed by
// hand before confirming, and nothing here can change the active diet plan
// - confirming only writes an additive outside_plan_food_entries row.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { AlertIcon, CheckIcon, ChevronLeftIcon, PlusIcon, CloseIcon, SpinnerIcon } from '@/components/ui/icons'
import { useLocalDate } from '@/lib/tracking/useLocalDate'
import { FOOD_SCAN_ALLOWED_MIME_TYPES, FOOD_SCAN_MAX_UPLOAD_BYTES } from '@/lib/outsidePlan/constants'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'
import type { ResolvedOutsidePlanNutrition } from '@/lib/outsidePlan/nutritionResolution'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import { confirmOutsidePlanScan, discardOutsidePlanScan, reResolveOutsidePlanItem } from '../outside-plan-actions'
import {
  buildReviewItems,
  itemNeedsNutrition,
  newManualItem,
  recalcMatchedItem,
  sumReviewTotals,
  toConfirmItems,
  toManualItem,
  isValidWeight,
  type ReviewItem
} from './reviewClient'

type Phase = 'pick' | 'analyzing' | 'review' | 'saving' | 'done'

interface AnalyzeSuccess {
  scanEventId: string | null
  fromCache: boolean
  imageUrl: string | null
  analysis: FoodAnalysisResult
  resolved: ResolvedOutsidePlanNutrition
  matchedFoods: Record<string, FoodMacro>
}

const MEAL_CONTEXTS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' }
] as const

const MAX_MB = Math.round(FOOD_SCAN_MAX_UPLOAD_BYTES / (1024 * 1024))

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function round(n: number): number {
  return Math.round(n)
}

const inputClass =
  'w-full min-h-[40px] bg-background border border-border rounded-control px-3 py-2 text-sm text-foreground font-mono tabular-nums placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors'
const textInputClass =
  'w-full min-h-[40px] bg-background border border-border rounded-control px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors'

export default function OutsidePlanScanner() {
  const router = useRouter()
  const localDate = useLocalDate()

  const [phase, setPhase] = useState<Phase>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const [scan, setScan] = useState<AnalyzeSuccess | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [mealContext, setMealContext] = useState<string | null>(null)
  const [savedTotals, setSavedTotals] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null)
  const [savedAlready, setSavedAlready] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  // Extra food_database bases discovered by "Re-check our database" - merged
  // on top of scan.matchedFoods for weight recompute.
  const [extraBases, setExtraBases] = useState<Record<string, FoodMacro>>({})
  const basisFor = useCallback(
    (id: string | null): FoodMacro | null => (id ? extraBases[id] ?? scan?.matchedFoods[id] ?? null : null),
    [extraBases, scan]
  )

  // Object URLs are created/revoked in the pick handler (below), not in an
  // effect - only this unmount cleanup lives here.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase === 'analyzing' || phase === 'done') statusRef.current?.focus()
  }, [phase])

  const setPickedFile = useCallback((next: File | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (next) {
      const url = URL.createObjectURL(next)
      previewUrlRef.current = url
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
    setFile(next)
  }, [])

  const totals = useMemo(() => sumReviewTotals(items), [items])
  const unresolvedCount = useMemo(() => items.filter(itemNeedsNutrition).length, [items])
  const canConfirm = items.length > 0 && unresolvedCount === 0 && phase === 'review'

  function pickFile(next: File | null) {
    setPickError(null)
    setAnalyzeError(null)
    if (!next) {
      setPickedFile(null)
      return
    }
    if (next.size > FOOD_SCAN_MAX_UPLOAD_BYTES) {
      setPickError(`That photo is ${formatBytes(next.size)} - over the ${MAX_MB} MB limit. Try a smaller one.`)
      return
    }
    if (next.type && !(FOOD_SCAN_ALLOWED_MIME_TYPES as readonly string[]).includes(next.type)) {
      setPickError('Use a JPEG, PNG, WebP, or HEIC photo.')
      return
    }
    setPickedFile(next)
  }

  async function runAnalyze() {
    if (!file) return
    setPhase('analyzing')
    setAnalyzeError(null)
    setConfirmError(null)

    const body = new FormData()
    body.append('file', file)

    try {
      const res = await fetch('/api/outside-plan/analyze', { method: 'POST', body })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.ok) {
        const message =
          (json && json.error && typeof json.error.message === 'string' && json.error.message) ||
          'Food analysis is temporarily unavailable. Please try again.'
        setAnalyzeError(message)
        setPhase('pick')
        return
      }

      const success = json as AnalyzeSuccess
      setScan(success)
      setItems(buildReviewItems(success.analysis, success.resolved))
      setExtraBases({})
      setPhase('review')
    } catch {
      setAnalyzeError('We could not reach the server. Check your connection and try again.')
      setPhase('pick')
    }
  }

  async function startOver(discard: boolean) {
    if (discard && scan?.scanEventId) {
      discardOutsidePlanScan(scan.scanEventId).catch(() => {})
    }
    setScan(null)
    setItems([])
    setExtraBases({})
    setMealContext(null)
    setConfirmError(null)
    setAnalyzeError(null)
    setSavedTotals(null)
    setSavedAlready(false)
    setPickedFile(null)
    setPhase('pick')
  }

  function patchItem(clientId: string, patch: Partial<ReviewItem>) {
    setItems(prev => prev.map(i => (i.clientId === clientId ? { ...i, ...patch } : i)))
  }

  function setWeight(item: ReviewItem, weightG: number | null) {
    if (item.source === 'matched') {
      const basis = basisFor(item.matchedFoodId)
      if (basis) {
        setItems(prev => prev.map(i => (i.clientId === item.clientId ? recalcMatchedItem(i, basis, weightG) : i)))
        return
      }
    }
    patchItem(item.clientId, { weightG })
  }

  async function recheckNutrition(item: ReviewItem) {
    const name = item.name.trim()
    if (!name) return
    patchItem(item.clientId, { warnings: ['Checking our food database…'] })
    const result = await reResolveOutsidePlanItem(name)
    if ('error' in result) {
      patchItem(item.clientId, { warnings: [result.error] })
      return
    }
    const { matchedFoodId, matchedFoodName, tier, basis, warnings } = result.data
    if (matchedFoodId && basis && (tier === 'high' || tier === 'medium')) {
      setExtraBases(prev => ({ ...prev, [matchedFoodId]: basis }))
      setItems(prev =>
        prev.map(i => {
          if (i.clientId !== item.clientId) return i
          const linked: ReviewItem = {
            ...i,
            source: 'matched',
            matchedFoodId,
            matchedFoodName,
            tierLabel: tier === 'high' ? 'high' : 'medium',
            warnings
          }
          return recalcMatchedItem(linked, basis, isValidWeight(i.weightG) ? i.weightG : null)
        })
      )
    } else {
      patchItem(item.clientId, {
        source: 'manual',
        matchedFoodId: null,
        matchedFoodName: null,
        tierLabel: item.detected ? 'manual' : 'added',
        warnings: warnings.length ? warnings : ['No safe database match - enter nutrition manually below.']
      })
    }
  }

  async function runConfirm() {
    if (!scan || !canConfirm) return
    setPhase('saving')
    setConfirmError(null)
    const result = await confirmOutsidePlanScan({
      scanEventId: scan.scanEventId ?? '',
      localDate,
      mealContext,
      items: toConfirmItems(items)
    })
    if ('error' in result) {
      setConfirmError(result.error)
      setPhase('review')
      return
    }
    setSavedTotals(result.data.totals)
    setSavedAlready(result.data.alreadyConfirmed)
    setPhase('done')
  }

  function goToDashboard() {
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Log Outside-Plan Food</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Photograph something you ate that wasn&apos;t part of your plan. We estimate it, you review it, and it&apos;s
            added to today&apos;s totals only &mdash; your diet plan is never changed.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="min-h-[44px] flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
        >
          <ChevronLeftIcon size={16} />
          Back to Dashboard
        </Link>
      </div>

      <div ref={statusRef} tabIndex={-1} aria-live="polite" className="focus:outline-none">
        {phase === 'pick' && (
          <PickScreen
            previewUrl={previewUrl}
            file={file}
            pickError={pickError}
            analyzeError={analyzeError}
            fileInputRef={fileInputRef}
            onPick={pickFile}
            onAnalyze={runAnalyze}
          />
        )}

        {phase === 'analyzing' && <AnalyzingScreen />}

        {(phase === 'review' || phase === 'saving') && scan && (
          <ReviewScreen
            scan={scan}
            items={items}
            mealContext={mealContext}
            setMealContext={setMealContext}
            totals={totals}
            unresolvedCount={unresolvedCount}
            canConfirm={canConfirm}
            saving={phase === 'saving'}
            confirmError={confirmError}
            basisFor={basisFor}
            onName={(id, name) => patchItem(id, { name })}
            onWeight={setWeight}
            onMacro={(id, key, value) => patchItem(id, { [key]: value } as Partial<ReviewItem>)}
            onDetach={item => patchItem(item.clientId, toManualItem(item))}
            onRecheck={recheckNutrition}
            onRemove={id => setItems(prev => prev.filter(i => i.clientId !== id))}
            onAdd={() => setItems(prev => [...prev, newManualItem()])}
            onRetake={() => startOver(true)}
            onConfirm={runConfirm}
          />
        )}

        {phase === 'done' && savedTotals && (
          <DoneScreen
            totals={savedTotals}
            alreadyConfirmed={savedAlready}
            items={items}
            onDashboard={goToDashboard}
            onAgain={() => startOver(false)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------- Pick / upload ----------------

function PickScreen({
  previewUrl,
  file,
  pickError,
  analyzeError,
  fileInputRef,
  onPick,
  onAnalyze
}: {
  previewUrl: string | null
  file: File | null
  pickError: string | null
  analyzeError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onPick: (f: File | null) => void
  onAnalyze: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <Card className="p-6 space-y-5">
      {analyzeError && <Notice tone="error">{analyzeError}</Notice>}

      {!previewUrl ? (
        <div
          onDragOver={e => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            onPick(e.dataTransfer.files?.[0] ?? null)
          }}
          className={`rounded-card border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
        >
          <p className="text-sm font-semibold text-foreground">Add a photo of your food</p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP or HEIC, up to {MAX_MB} MB. A clear, close shot of the food works best.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              Choose photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute('capture', 'environment')
                  fileInputRef.current.click()
                }
              }}
            >
              Take photo
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">or drag an image here</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-card border border-border bg-surface-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Selected food, ready to analyze" className="max-h-[360px] w-full object-contain" />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {file?.name ? `${file.name} · ` : ''}
              {file ? formatBytes(file.size) : ''}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onPick(null)}>
                Remove
              </Button>
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Choose another
              </Button>
            </div>
          </div>
        </div>
      )}

      {pickError && <Notice tone="error">{pickError}</Notice>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={e => {
          onPick(e.target.files?.[0] ?? null)
          e.target.removeAttribute('capture')
          e.target.value = ''
        }}
      />

      <div className="flex justify-end">
        <Button type="button" onClick={onAnalyze} disabled={!file}>
          Analyze Food
        </Button>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Your photo is processed to identify the food and estimate portions. Results are an AI estimate for you to review,
        not a measurement.
      </p>
    </Card>
  )
}

// ---------------- Analyzing ----------------

function AnalyzingScreen() {
  return (
    <Card className="p-8 text-center space-y-4">
      <SpinnerIcon size={28} className="animate-spin mx-auto text-primary" />
      <div>
        <p className="text-base font-bold text-foreground">Analyzing your food&hellip;</p>
        <p className="mt-1 text-sm text-muted-foreground">This usually takes a few seconds.</p>
      </div>
      <ul className="mx-auto max-w-xs text-left text-sm text-muted-foreground space-y-1.5">
        <li>&bull; Reading the photo</li>
        <li>&bull; Identifying foods</li>
        <li>&bull; Estimating portions</li>
        <li>&bull; Matching nutrition from our database</li>
      </ul>
    </Card>
  )
}

// ---------------- Review ----------------

function ReviewScreen(props: {
  scan: AnalyzeSuccess
  items: ReviewItem[]
  mealContext: string | null
  setMealContext: (v: string | null) => void
  totals: { calories: number; protein: number; carbs: number; fat: number }
  unresolvedCount: number
  canConfirm: boolean
  saving: boolean
  confirmError: string | null
  basisFor: (id: string | null) => FoodMacro | null
  onName: (id: string, name: string) => void
  onWeight: (item: ReviewItem, weightG: number | null) => void
  onMacro: (id: string, key: 'calories' | 'protein' | 'carbs' | 'fat', value: number | null) => void
  onDetach: (item: ReviewItem) => void
  onRecheck: (item: ReviewItem) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onRetake: () => void
  onConfirm: () => void
}) {
  const { scan, items, totals, unresolvedCount, canConfirm, saving } = props
  const confidence = scan.analysis.overallConfidence

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {scan.imageUrl && (
            <div className="sm:w-48 shrink-0 overflow-hidden rounded-card border border-border bg-surface-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scan.imageUrl} alt="The food you photographed" className="h-40 sm:h-full w-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl font-bold text-foreground">Here&apos;s what we think you ate</h2>
              {confidence !== null && (
                <Badge variant={confidence >= 0.75 ? 'success' : confidence >= 0.5 ? 'warning' : 'neutral'}>
                  {confidence >= 0.75 ? 'High' : confidence >= 0.5 ? 'Medium' : 'Low'} AI confidence
                </Badge>
              )}
              {scan.fromCache && <Badge variant="neutral">From a recent scan</Badge>}
            </div>
            {scan.analysis.mealDescription && (
              <p className="text-sm text-muted-foreground">{scan.analysis.mealDescription}</p>
            )}
            <p className="text-xs text-muted-foreground">
              These are <strong>AI estimates</strong>, not measurements. Check each item, fix anything that looks off, and
              add or remove foods before you confirm.
            </p>
          </div>
        </div>

        {scan.analysis.warnings.length > 0 && (
          <Notice tone="warning">
            <ul className="space-y-1">
              {scan.analysis.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Notice>
        )}
      </Card>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">When did you eat this? (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_CONTEXTS.map(mc => {
            const active = props.mealContext === mc.value
            return (
              <button
                key={mc.value}
                type="button"
                aria-pressed={active}
                onClick={() => props.setMealContext(active ? null : mc.value)}
                className={`min-h-[40px] px-4 rounded-pill text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-foreground hover:border-muted-foreground'
                }`}
              >
                {mc.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="space-y-3">
        {items.map(item => (
          <ReviewItemRow
            key={item.clientId}
            item={item}
            hasBasis={Boolean(props.basisFor(item.matchedFoodId))}
            onName={name => props.onName(item.clientId, name)}
            onWeight={w => props.onWeight(item, w)}
            onMacro={(key, v) => props.onMacro(item.clientId, key, v)}
            onDetach={() => props.onDetach(item)}
            onRecheck={() => props.onRecheck(item)}
            onRemove={() => props.onRemove(item.clientId)}
          />
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={props.onAdd} className="w-full">
        <PlusIcon size={16} />
        Add another food
      </Button>

      <Card elevated className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground">Outside-plan total</h3>
          <span className="font-mono tabular-nums text-2xl font-bold text-calories">{round(totals.calories)} kcal</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center font-mono tabular-nums text-sm">
          <MacroTotal label="Protein" value={totals.protein} className="text-protein" />
          <MacroTotal label="Carbs" value={totals.carbs} className="text-carbs" />
          <MacroTotal label="Fat" value={totals.fat} className="text-fat" />
        </div>

        {unresolvedCount > 0 ? (
          <Notice tone="warning">
            {unresolvedCount === 1 ? 'One food still needs' : `${unresolvedCount} foods still need`} nutrition information.
            Add a weight for a matched food, or enter calories and macros for a manual one &mdash; or remove the item.
          </Notice>
        ) : (
          <p className="text-xs text-muted-foreground">
            Confirming adds this to <strong>today&apos;s consumed totals</strong>. It does not change your diet plan or any
            planned meal.
          </p>
        )}

        {props.confirmError && <Notice tone="error">{props.confirmError}</Notice>}

        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <Button type="button" variant="ghost" onClick={props.onRetake} disabled={saving}>
            Retake photo
          </Button>
          <Button type="button" onClick={props.onConfirm} disabled={!canConfirm} loading={saving}>
            Confirm &amp; Track
          </Button>
        </div>
      </Card>
    </div>
  )
}

function MacroTotal({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div>
      <div className="text-muted-foreground font-sans text-xs mb-0.5">{label}</div>
      <div className={`font-semibold ${className}`}>{round(value)} g</div>
    </div>
  )
}

// ---------------- One review item ----------------

function ReviewItemRow({
  item,
  hasBasis,
  onName,
  onWeight,
  onMacro,
  onDetach,
  onRecheck,
  onRemove
}: {
  item: ReviewItem
  hasBasis: boolean
  onName: (name: string) => void
  onWeight: (w: number | null) => void
  onMacro: (key: 'calories' | 'protein' | 'carbs' | 'fat', v: number | null) => void
  onDetach: () => void
  onRecheck: () => void
  onRemove: () => void
}) {
  const needs = itemNeedsNutrition(item)
  const isMatched = item.source === 'matched'

  const badge = isMatched ? (
    <Badge variant="success">
      <CheckIcon size={12} />
      {item.tierLabel === 'high' ? 'Database match' : 'Likely match'}
    </Badge>
  ) : needs ? (
    <Badge variant="warning">
      <AlertIcon size={12} />
      Needs review
    </Badge>
  ) : (
    <Badge variant="neutral">{item.detected ? 'Manual nutrition' : 'Added by you'}</Badge>
  )

  const numField = (
    key: 'calories' | 'protein' | 'carbs' | 'fat',
    label: string,
    value: number | null
  ) => (
    <Field label={label} id={`${key}-${item.clientId}`}>
      <input
        id={`${key}-${item.clientId}`}
        type="number"
        inputMode="decimal"
        min={0}
        value={value ?? ''}
        onChange={e => onMacro(key, e.target.value === '' ? null : Number(e.target.value))}
        className={inputClass}
      />
    </Field>
  )

  return (
    <Card className={`p-4 space-y-3 ${needs ? 'border-warning/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor={`name-${item.clientId}`}>
            Food name
          </label>
          <input
            id={`name-${item.clientId}`}
            type="text"
            value={item.name}
            onChange={e => onName(e.target.value)}
            placeholder="e.g. Cheeseburger"
            className={textInputClass}
          />
          {item.portionText && <p className="text-xs text-muted-foreground">Estimated portion: {item.portionText}</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {badge}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.name || 'this item'}`}
            className="text-muted-foreground hover:text-error transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary p-1"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      {item.aiNotes && <p className="text-xs text-muted-foreground italic">AI note: {item.aiNotes}</p>}

      {item.warnings.length > 0 && (
        <ul className="text-xs text-warning space-y-1">
          {item.warnings.map((w, i) => (
            <li key={i}>&bull; {w}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Field label="Weight (g)" id={`w-${item.clientId}`}>
          <input
            id={`w-${item.clientId}`}
            type="number"
            inputMode="decimal"
            min={0}
            value={item.weightG ?? ''}
            onChange={e => onWeight(e.target.value === '' ? null : Number(e.target.value))}
            placeholder="—"
            className={inputClass}
          />
        </Field>

        {isMatched ? (
          <>
            <ReadonlyMacro label="Calories" value={item.calories} />
            <ReadonlyMacro label="Protein" value={item.protein} />
            <ReadonlyMacro label="Carbs" value={item.carbs} />
            <ReadonlyMacro label="Fat" value={item.fat} />
          </>
        ) : (
          <>
            {numField('calories', 'Calories', item.calories)}
            {numField('protein', 'Protein', item.protein)}
            {numField('carbs', 'Carbs', item.carbs)}
            {numField('fat', 'Fat', item.fat)}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {isMatched ? (
          <>
            <span className="text-muted-foreground">
              Nutrition from <strong>{item.matchedFoodName}</strong> in our database, scaled to the weight above.
            </span>
            <button
              type="button"
              onClick={onDetach}
              className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Edit nutrition manually
            </button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">You&apos;re entering these values yourself.</span>
            <button
              type="button"
              onClick={onRecheck}
              className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Re-check our database
            </button>
            {hasBasis && item.matchedFoodId && (
              <span className="text-muted-foreground">(was linked to {item.matchedFoodName})</span>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function ReadonlyMacro({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="min-h-[40px] flex items-center px-3 rounded-control border border-border bg-surface-elevated text-sm font-mono tabular-nums text-foreground">
        {value === null ? '—' : Math.round(value * 10) / 10}
      </div>
    </div>
  )
}

// ---------------- Done ----------------

function DoneScreen({
  totals,
  alreadyConfirmed,
  items,
  onDashboard,
  onAgain
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number }
  alreadyConfirmed: boolean
  items: ReviewItem[]
  onDashboard: () => void
  onAgain: () => void
}) {
  return (
    <Card className="p-6 space-y-5 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckIcon size={24} />
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          {alreadyConfirmed ? 'Already logged' : 'Added to today'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {alreadyConfirmed
            ? 'This scan was already tracked - nothing was added twice.'
            : 'This outside-plan food is now part of today’s consumed totals. Your diet plan is unchanged.'}
        </p>
      </div>

      <div className="mx-auto max-w-sm rounded-card border border-border bg-surface-elevated p-4">
        <div className="font-mono tabular-nums text-3xl font-bold text-calories">{round(totals.calories)} kcal</div>
        <div className="mt-1 grid grid-cols-3 gap-2 font-mono tabular-nums text-sm">
          <span className="text-protein">{round(totals.protein)}g P</span>
          <span className="text-carbs">{round(totals.carbs)}g C</span>
          <span className="text-fat">{round(totals.fat)}g F</span>
        </div>
        <ul className="mt-3 text-left text-xs text-muted-foreground space-y-0.5">
          {items.map(i => (
            <li key={i.clientId}>
              {i.name || 'Item'} &mdash; {i.weightG ? `${round(i.weightG)} g, ` : ''}
              {round(i.calories ?? 0)} kcal
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
        <Button type="button" variant="secondary" onClick={onAgain}>
          Scan another
        </Button>
        <Button type="button" onClick={onDashboard}>
          Back to dashboard
        </Button>
      </div>
    </Card>
  )
}

// ---------------- shared ----------------

function Notice({ tone, children }: { tone: 'error' | 'warning'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'border-error/30 bg-error/10 text-error' : 'border-warning/30 bg-warning/10 text-warning'
  return (
    <div className={`flex gap-2 rounded-control border p-3 text-xs ${cls}`} role={tone === 'error' ? 'alert' : undefined}>
      <AlertIcon size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
