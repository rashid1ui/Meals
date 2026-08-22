'use client'

// Dashboard "Workout Meal Recommendations" card (spec section 2). Purely
// informational suggestions layered on top of data DietEditor already has -
// the user's training time (profiles, collected by TrainingNutritionStep),
// their plan's goal, and how much of today's calorie/protein target is
// still remaining (targets minus what's already logged as eaten). Never
// writes to the diet plan itself; a user who wants one tracked adds it via
// the existing "Add food" flow on whichever meal fits, same as any other food.

import { useMemo } from 'react'
import {
  recommendWorkoutMeals,
  trainingTimeLabel,
  type TrainingTime,
  type WorkoutMealTemplate
} from '@/lib/nutrition/workoutMeals'
import type { Goal } from '@/lib/nutrition/engine'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

type Props = {
  trainingTime: TrainingTime | null
  trainingTimeCustom: string | null
  goal: Goal | null
  remainingProtein: number
  remainingCalories: number
}

function TemplateRow({ template }: { template: WorkoutMealTemplate }) {
  return (
    <div className="p-3 rounded-control border border-border space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-sm text-foreground">{template.title}</span>
        <Badge variant={template.prepTime === 'quick' ? 'success' : 'neutral'}>
          {template.prepTime === 'quick' ? 'Quick' : 'Needs time'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{template.description}</p>
      <div className="flex items-center gap-3 font-mono tabular-nums text-xs">
        <span className="text-protein font-semibold">~{template.approxProtein}g protein</span>
        <span className="text-muted-foreground">~{template.approxCalories} kcal</span>
      </div>
    </div>
  )
}

export default function WorkoutMealRecommendations({
  trainingTime,
  trainingTimeCustom,
  goal,
  remainingProtein,
  remainingCalories
}: Props) {
  const recommendations = useMemo(
    () => recommendWorkoutMeals({ goal, remainingProtein, remainingCalories }),
    [goal, remainingProtein, remainingCalories]
  )

  if (!trainingTime) return null

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg font-bold text-foreground">Workout Meal Ideas</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {trainingTimeLabel(trainingTime, trainingTimeCustom)} training - suggestions based on your goal and what&apos;s left in today&apos;s targets.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Pre-Workout
          </span>
          <div className="space-y-2">
            {recommendations.preWorkout.slice(0, 3).map(t => (
              <TemplateRow key={t.id} template={t} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Post-Workout
          </span>
          <div className="space-y-2">
            {recommendations.postWorkout.slice(0, 3).map(t => (
              <TemplateRow key={t.id} template={t} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
