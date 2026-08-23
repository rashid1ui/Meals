'use client'

import { useMemo } from 'react'
import type { DraftMeal, MacroTotals } from '@/lib/diet/diff'
import { classifyTarget } from '@/lib/diet/diff'
import { splitProteinByType, RECOMMENDED_ANIMAL_PROTEIN_PCT, RECOMMENDED_PLANT_PROTEIN_PCT, type ProteinType } from '@/lib/nutrition/proteinType'
import { splitCarbsByType, type CarbType } from '@/lib/nutrition/carbType'
import { AlertIcon } from '@/components/ui/icons'

export interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type Props = {
  dailyTotals: MacroTotals
  targets: Targets
  meals: DraftMeal[]
  proteinTypeByName: ReadonlyMap<string, ProteinType | null | undefined>
  proteinCategoryByName: ReadonlyMap<string, string | null | undefined>
  carbTypeByName: ReadonlyMap<string, CarbType | null | undefined>
  carbCategoryByName: ReadonlyMap<string, string | null | undefined>
}

const FAT_SOURCES = ['Olive oil', 'Nuts', 'Peanut butter', 'Avocado']

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export default function SmartGuidancePanels({
  dailyTotals,
  targets,
  meals,
  proteinTypeByName,
  proteinCategoryByName,
  carbTypeByName,
  carbCategoryByName
}: Props) {
  const allFoods = useMemo(() => meals.flatMap(m => m.foods), [meals])

  const proteinBreakdown = useMemo(
    () => splitProteinByType(allFoods, proteinTypeByName, proteinCategoryByName),
    [allFoods, proteinTypeByName, proteinCategoryByName]
  )
  const carbBreakdown = useMemo(
    () => splitCarbsByType(allFoods, carbTypeByName, carbCategoryByName),
    [allFoods, carbTypeByName, carbCategoryByName]
  )

  const animalPct = pct(proteinBreakdown.animal, dailyTotals.protein)
  const plantPct = pct(proteinBreakdown.plant, dailyTotals.protein)
  const plantDominant = proteinBreakdown.plant > proteinBreakdown.animal

  const fatComparison = classifyTarget(dailyTotals.fat, targets.fat)
  const fatWarning =
    fatComparison.status === 'under' || fatComparison.status === 'slightly-under'
      ? 'Your fat intake looks low - healthy fats support hormone production and nutrient absorption.'
      : fatComparison.status === 'over' || fatComparison.status === 'slightly-over'
        ? 'Your fat intake is running high relative to your target.'
        : null

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-foreground">Smart Nutrition Guidance</h2>

      {/* Protein Analysis */}
      <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold text-foreground">Protein Analysis</span>
          <span className="font-mono tabular-nums text-sm text-protein">
            {Math.round(dailyTotals.protein)}g / {Math.round(targets.protein)}g
          </span>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground font-mono tabular-nums">
          <span>Animal {animalPct}%</span>
          <span>Plant {plantPct}%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Recommended: ~{RECOMMENDED_ANIMAL_PROTEIN_PCT[0]}-{RECOMMENDED_ANIMAL_PROTEIN_PCT[1]}% animal, ~
          {RECOMMENDED_PLANT_PROTEIN_PCT[0]}-{RECOMMENDED_PLANT_PROTEIN_PCT[1]}% plant.
        </p>
        {plantDominant && dailyTotals.protein > 0 && (
          <div className="flex items-start gap-2 pt-1 text-xs text-warning">
            <AlertIcon size={14} className="shrink-0 mt-0.5" />
            <span>Most of your protein comes from plant sources - consider adding an animal or supplement source for a fuller amino acid profile.</span>
          </div>
        )}
      </div>

      {/* Carb Education */}
      <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold text-foreground">Carb Education</span>
          <span className="font-mono tabular-nums text-sm text-carbs">
            {Math.round(dailyTotals.carbs)}g / {Math.round(targets.carbs)}g
          </span>
        </div>
        {carbBreakdown.simple > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Simple carbs ({Math.round(carbBreakdown.simple)}g):</span> quick
            energy, best around workouts. Examples: fruit, honey, white bread.
          </div>
        )}
        {carbBreakdown.complex > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Complex carbs ({Math.round(carbBreakdown.complex)}g):</span> steady
            energy and fiber. Examples: oats, brown rice, sweet potato, quinoa, legumes.
          </div>
        )}
        {carbBreakdown.simple === 0 && carbBreakdown.complex === 0 && (
          <p className="text-xs text-muted-foreground">Add some carb sources to your meals to see a breakdown here.</p>
        )}
      </div>

      {/* Fat Analysis */}
      <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold text-foreground">Fat Analysis</span>
          <span className="font-mono tabular-nums text-sm text-fat">
            {Math.round(dailyTotals.fat)}g / {Math.round(targets.fat)}g
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Healthy sources: {FAT_SOURCES.join(', ')}.</p>
        {fatWarning && (
          <div className="flex items-start gap-2 pt-1 text-xs text-warning">
            <AlertIcon size={14} className="shrink-0 mt-0.5" />
            <span>{fatWarning}</span>
          </div>
        )}
      </div>
    </div>
  )
}
