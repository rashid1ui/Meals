import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchActiveFoodCandidates } from './nutritionResolutionService'

const repoRoot = join(import.meta.dirname, '..', '..')
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8')

// ---- O. Cache compatibility: nutrition resolution must never trigger a
// new Kimi call. This is a structural, source-text guarantee (mirroring
// lib/images/serverOnly.test.ts's own testing convention) rather than a
// runtime mock, since the strongest proof that no AI call can happen is
// that the code calling it is never even imported.
test('O. nutrition resolution files never import the vision-analysis function or the Kimi provider (only its types)', () => {
  for (const file of ['lib/outsidePlan/nutritionResolution.ts', 'lib/outsidePlan/nutritionResolutionService.ts', 'lib/outsidePlan/nutritionMatching.ts']) {
    const src = read(file)
    assert.doesNotMatch(src, /from ['"]@\/lib\/ai-vision['"]/, `${file} must not import the callable analyzeFoodImage from lib/ai-vision's index`)
    assert.doesNotMatch(src, /lib\/ai-vision\/providers\/kimi/, `${file} must not import the Kimi provider directly`)
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${file} must not make any network call`)
  }
})

// ---- P. Security: never resurrect an inactive/soft-deleted catalog row ----

type QueryResult<T> = { data: T | null; error: { message: string } | null }

function makeFakeSupabaseForCandidates(rows: Record<string, unknown>[]) {
  const calls: { method: string; args: unknown[] }[] = []
  const chain = {
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args })
      return chain
    },
    then: (resolve: (v: QueryResult<Record<string, unknown>[]>) => void) => {
      // Simulates the real query: only rows matching every .eq() filter
      // applied so far are returned - specifically is_active=true.
      const isActiveFilter = calls.find(c => c.method === 'eq' && c.args[0] === 'is_active')
      const filtered = isActiveFilter ? rows.filter(r => r.is_active === isActiveFilter.args[1]) : rows
      resolve({ data: filtered, error: null })
    }
  }
  return {
    from: () => ({ select: () => chain }),
    __calls: calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

test('P. fetchActiveFoodCandidates filters to is_active=true, excluding soft-deleted/test rows', async () => {
  const rows = [
    { id: 'apple', name: 'Apple, Raw', category: 'fruit', serving_size: '100', serving_unit: 'grams', calories: '52', protein: '0.3', carbs: '13.8', fat: '0.2', is_active: true },
    { id: 'ggg-test-row', name: 'ggg', category: 'protein', serving_size: '100', serving_unit: 'grams', calories: '100', protein: '20', carbs: '30', fat: '2', is_active: false }
  ]
  const supabase = makeFakeSupabaseForCandidates(rows)
  const candidates = await fetchActiveFoodCandidates(supabase)
  assert.strictEqual(candidates.length, 1)
  assert.strictEqual(candidates[0].id, 'apple')
  assert.ok(!candidates.some(c => c.id === 'ggg-test-row'), 'an inactive/soft-deleted row must never be returned as a matchable candidate')
})

test('P. numeric columns are coerced from string (as Postgres numeric types often arrive) to actual numbers', async () => {
  const rows = [{ id: 'apple', name: 'Apple, Raw', category: 'fruit', serving_size: '100', serving_unit: 'grams', calories: '52', protein: '0.3', carbs: '13.8', fat: '0.2', is_active: true }]
  const supabase = makeFakeSupabaseForCandidates(rows)
  const candidates = await fetchActiveFoodCandidates(supabase)
  assert.strictEqual(typeof candidates[0].calories, 'number')
  assert.strictEqual(candidates[0].calories, 52)
})
