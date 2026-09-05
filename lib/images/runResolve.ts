import 'server-only'

// Server-only glue: binds the real Pexels + Open Food Facts clients to the
// pure resolvers and persists the outcome. This is the single entry point
// used by the `after()` create hooks (via schedule.ts) and the
// /api/cron/images reconciliation sweep. Never reached from render.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchPexels, pexelsConfigured } from './pexels'
import { searchOpenFoodFacts } from './openFoodFacts'
import { resolveFoodImage } from './resolveFood'
import { resolveSupplementImage } from './resolveSupplement'
import { resolveMealImage, type MealFoodContribution } from './resolveMeal'
import { persistImage, type PersistResult } from './persist'
import type { ImageEntityKind } from './types'

export type ResolveTarget = { kind: ImageEntityKind; id: string }

const pexelsSearch = (q: string) => searchPexels(q)

type FoodRow = { id: string; name: string; category: string | null; image_url: string | null; image_status: string | null }
type SupplementRow = { id: string; name: string; image_url: string | null; image_status: string | null }
type MealRow = { id: string; name: string; image_url: string | null; image_status: string | null }
type MealFoodRow = { name: string; calories: number | string | null }

// Resolve + persist one entity. Swallows every failure into a logged
// 'unresolved' (or 'error') result - the create flow / sweep must never
// throw because an image could not be found.
export async function resolveAndPersist(
  admin: SupabaseClient,
  { kind, id }: ResolveTarget,
  opts: { force?: boolean } = {}
): Promise<PersistResult> {
  try {
    if (!pexelsConfigured() && kind !== 'supplement') {
      // Food/meal resolution needs Pexels; with no key, leave it for a
      // later run once the key is configured rather than marking unresolved.
      console.warn(`[images] PEXELS_API_KEY not set - skipping ${kind} ${id} (will retry).`)
      return { outcome: 'skipped', reason: 'already_has_image' }
    }

    if (kind === 'food') {
      const { data } = await admin
        .from('food_database')
        .select('id, name, category, image_url, image_status')
        .eq('id', id)
        .maybeSingle<FoodRow>()
      if (!data) return { outcome: 'error', message: 'food not found' }

      const resolved =
        data.category === 'supplement'
          ? await resolveSupplementImage(data, {
              searchProduct: q => searchOpenFoodFacts(q),
              searchStock: pexelsSearch
            })
          : await resolveFoodImage(data, pexelsSearch)
      return persistImage(admin, 'food_database', id, resolved, opts)
    }

    if (kind === 'supplement') {
      const { data } = await admin
        .from('user_supplements')
        .select('id, name, image_url, image_status')
        .eq('id', id)
        .maybeSingle<SupplementRow>()
      if (!data) return { outcome: 'error', message: 'supplement not found' }

      const resolved = await resolveSupplementImage(data, {
        searchProduct: q => searchOpenFoodFacts(q),
        searchStock: pexelsSearch
      })
      return persistImage(admin, 'user_supplements', id, resolved, opts)
    }

    // kind === 'meal'
    const { data: meal } = await admin
      .from('meals')
      .select('id, name, image_url, image_status')
      .eq('id', id)
      .maybeSingle<MealRow>()
    if (!meal) return { outcome: 'error', message: 'meal not found' }

    const { data: mealFoods } = await admin.from('foods').select('name, calories').eq('meal_id', id)
    const foods: MealFoodContribution[] = ((mealFoods as MealFoodRow[] | null) ?? []).map(f => ({
      foodDatabaseId: null,
      name: f.name,
      calories: Number(f.calories) || 0
    }))

    const resolved = await resolveMealImage(meal, foods, pexelsSearch)
    return persistImage(admin, 'meals', id, resolved, opts)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[images] resolveAndPersist ${kind} ${id} failed:`, message)
    return { outcome: 'error', message }
  }
}

// Convenience wrappers that build their own admin client - used by the
// `after()` create hooks (schedule.ts).
export async function resolveAndPersistFood(id: string): Promise<PersistResult> {
  return resolveAndPersist(createAdminClient(), { kind: 'food', id })
}
export async function resolveAndPersistSupplement(id: string): Promise<PersistResult> {
  return resolveAndPersist(createAdminClient(), { kind: 'supplement', id })
}
export async function resolveAndPersistMeal(id: string): Promise<PersistResult> {
  return resolveAndPersist(createAdminClient(), { kind: 'meal', id })
}
