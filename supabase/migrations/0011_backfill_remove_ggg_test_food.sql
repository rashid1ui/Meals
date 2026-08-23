-- ==============================================================================
-- Migration: Backfill - remove "ggg" test food
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Already applied directly to the live database (recorded there as
-- "remove_ggg_test_food", version 20260822080849) but never committed to
-- this migrations folder. Backfilled here, idempotent.
-- ==============================================================================

-- Remove a test/junk entry named "ggg" (id 5632e3d3-2199-4147-ba4a-f99b831c2180,
-- category 'protein') that was created via the custom-food feature during
-- testing and is not a real food. Soft-deleted (is_active=false), matching
-- how Pork Tenderloin was removed - fully removes it from every
-- food-selection surface (all reads filter is_active=true) without
-- touching any historical diet_plans/meals/foods rows that may reference
-- its name as a point-in-time snapshot.
UPDATE public.food_database SET is_active = false WHERE name = 'ggg';
