// Workout meal recommendations - pure, framework-free (no Supabase, no 'use
// server'), same pattern as engine.ts/proteinType.ts in this directory.
//
// Deliberately a curated STATIC template list, not an AI call: the spec's
// examples (banana+whey, oats+Greek yogurt, rice+chicken, ...) are a short,
// well-known set of pre/post-workout combinations, not something that
// benefits from generation. Recommendations are informational only - they
// never modify the generated diet plan or its macro solve (lib/diet/generate-diet.ts
// is untouched by this module), so this feature can't regress existing meal
// generation or tracking.

import type { Goal } from './engine'

export type TrainingTime = 'morning' | 'afternoon' | 'evening' | 'custom'

export interface WorkoutMealTemplate {
  id: string
  title: string
  description: string
  // Rough per-serving macros, for display only - never fed into the diet
  // solver or persisted as a plan food. A user who wants one tracked adds it
  // via the existing "Add food" flow (AddFoodPopover), same as any other food.
  approxProtein: number
  approxCalories: number
  // 'quick' meals need under ~15 minutes and no cooking - suited to a short
  // pre-workout window; others assume more lead time.
  prepTime: 'quick' | 'moderate'
  suitableGoals: Goal[]
}

export const PRE_WORKOUT_TEMPLATES: WorkoutMealTemplate[] = [
  {
    id: 'pre-banana-whey',
    title: 'Banana + Whey Shake',
    description: 'Fast-digesting carbs and protein, easy on the stomach right before training.',
    approxProtein: 25,
    approxCalories: 220,
    prepTime: 'quick',
    suitableGoals: ['cut', 'recomp', 'lean_bulk', 'maintain']
  },
  {
    id: 'pre-oats-yogurt',
    title: 'Oats + Greek Yogurt',
    description: 'Slower-digesting carbs plus a solid protein hit - good 60-90 minutes out.',
    approxProtein: 22,
    approxCalories: 320,
    prepTime: 'moderate',
    suitableGoals: ['recomp', 'lean_bulk', 'maintain']
  },
  {
    id: 'pre-rice-chicken',
    title: 'Rice + Chicken',
    description: 'A full meal of clean carbs and lean protein - only if you have 2+ hours to digest before training.',
    approxProtein: 40,
    approxCalories: 450,
    prepTime: 'moderate',
    suitableGoals: ['lean_bulk', 'maintain']
  },
  {
    id: 'pre-toast-honey',
    title: 'Toast + Honey',
    description: 'A light, fast-digesting carb source when you need something quick with minimal fat.',
    approxProtein: 6,
    approxCalories: 180,
    prepTime: 'quick',
    suitableGoals: ['cut']
  }
]

export const POST_WORKOUT_TEMPLATES: WorkoutMealTemplate[] = [
  {
    id: 'post-whey-carbs',
    title: 'Whey + Fast Carbs',
    description: 'Whey protein with a quick carb source (rice cakes, fruit) to kickstart recovery immediately after training.',
    approxProtein: 30,
    approxCalories: 300,
    prepTime: 'quick',
    suitableGoals: ['cut', 'recomp', 'lean_bulk', 'maintain']
  },
  {
    id: 'post-chicken-rice',
    title: 'Chicken + Rice',
    description: 'The classic post-workout meal - lean protein and clean carbs to replenish glycogen and support recovery.',
    approxProtein: 45,
    approxCalories: 500,
    prepTime: 'moderate',
    suitableGoals: ['recomp', 'lean_bulk', 'maintain']
  },
  {
    id: 'post-eggs-toast',
    title: 'Eggs + Toast',
    description: 'A simple whole-food option when you have time to cook right after training.',
    approxProtein: 24,
    approxCalories: 380,
    prepTime: 'moderate',
    suitableGoals: ['cut', 'recomp', 'maintain']
  },
  {
    id: 'post-cottage-cheese-fruit',
    title: 'Cottage Cheese + Fruit',
    description: 'Slower-digesting protein plus fruit - a lighter option that still supports recovery.',
    approxProtein: 20,
    approxCalories: 220,
    prepTime: 'quick',
    suitableGoals: ['cut']
  }
]

const TRAINING_TIME_LABEL: Record<TrainingTime, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  custom: 'Your scheduled time'
}

export function trainingTimeLabel(time: TrainingTime | null | undefined, customTime?: string | null): string {
  if (!time) return 'Training time'
  if (time === 'custom' && customTime) return `Training at ${customTime}`
  return TRAINING_TIME_LABEL[time]
}

export interface WorkoutMealRecommendations {
  preWorkout: WorkoutMealTemplate[]
  postWorkout: WorkoutMealTemplate[]
}

// Filters + ranks the static template lists by the user's goal, then by how
// well each template fits what's actually left in today's targets: options
// that would blow past the remaining calorie budget sort to the back, and
// among calorie-appropriate options, ones whose protein doesn't overshoot
// what's still needed rank first. Nothing is ever hidden outright - these
// are suggestions, not a hard constraint.
export function recommendWorkoutMeals(params: {
  goal: Goal | null
  remainingProtein: number
  remainingCalories: number
}): WorkoutMealRecommendations {
  const { goal, remainingProtein, remainingCalories } = params

  const rank = (templates: WorkoutMealTemplate[]): WorkoutMealTemplate[] => {
    const matching = goal ? templates.filter(t => t.suitableGoals.includes(goal)) : templates
    const pool = matching.length > 0 ? matching : templates
    return [...pool].sort((a, b) => {
      const aFitsCalories = a.approxCalories <= Math.max(remainingCalories, 0) ? 0 : 1
      const bFitsCalories = b.approxCalories <= Math.max(remainingCalories, 0) ? 0 : 1
      if (aFitsCalories !== bFitsCalories) return aFitsCalories - bFitsCalories

      const aOvershootsProtein = remainingProtein > 0 && a.approxProtein > remainingProtein
      const bOvershootsProtein = remainingProtein > 0 && b.approxProtein > remainingProtein
      if (aOvershootsProtein !== bOvershootsProtein) return aOvershootsProtein ? 1 : -1

      return b.approxProtein - a.approxProtein
    })
  }

  return {
    preWorkout: rank(PRE_WORKOUT_TEMPLATES),
    postWorkout: rank(POST_WORKOUT_TEMPLATES)
  }
}
