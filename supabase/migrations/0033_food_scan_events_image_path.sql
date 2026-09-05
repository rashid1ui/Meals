-- ==============================================================================
-- Migration: food_scan_events.image_storage_path
-- ==============================================================================
-- Small additive follow-up to 0031/0032, surfaced while implementing Phase 2
-- (Storage)'s orphan-cleanup requirement: outside_plan_food_entries only
-- ever gets a row once the user CONFIRMS a scan, so an abandoned upload
-- (closed tab, crash, or a cancel whose immediate client-side delete never
-- fired) had no database record of which Storage object it wrote - nothing
-- to sweep. food_scan_events already records one row per AI attempt
-- regardless of confirmation (migration 0031's whole point), so it is the
-- natural place to also record the Storage path at upload time, letting
-- lib/outsidePlan/storage.ts's pruneOrphanedFoodScanUploads find and delete
-- stale, never-confirmed objects. Nullable and additive only - no existing
-- column, constraint, or row is touched.
-- ==============================================================================

alter table public.food_scan_events
  add column if not exists image_storage_path text;
