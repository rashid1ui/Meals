-- Migration: automatic image resolution for foods, meals & supplements
-- ---------------------------------------------------------------------------
-- Extends the presentation-only image system introduced in 0029 (which added
-- food_database.image_url / image_alt / image_attribution) into a permanent,
-- automatic resolver that runs whenever a food, meal, supplement or vitamin
-- enters the database. Purely additive: every column below is NULLABLE with
-- no default, no constraint, no RLS change. Nutrition, servings, units,
-- names, categories, ordering and every existing code path are untouched. A
-- row with no image_url simply renders the existing deterministic
-- emoji/pill fallback in the UI.
--
--   image_status      - resolution bookkeeping, one of:
--                         NULL            never attempted
--                         'pending'       scheduled, not yet resolved
--                         'resolved'      a confident real photo is stored
--                         'representative' a category/stock photo is stored
--                                         (attribution.is_representative = true)
--                         'unresolved'    attempted, no confident match - left
--                                         on the fallback, logged for review
--                         'user_provided' a human set this image - automatic
--                                         resolution must NEVER overwrite it
--   image_checked_at  - when resolution last ran, so the reconciliation
--                       sweep (app/api/cron/images) can skip fresh rows and
--                       retry stale ones.
--
-- meals also gains:
--   image_url / image_alt / image_attribution - same shape as food_database.
--   image_composition_key - a stable fingerprint of (meal-type token + the
--                       SET of food identities in the meal), independent of
--                       quantities, food order, sort_order and tracking. The
--                       dashboard save path (which deletes + reinserts meal
--                       rows on every edit) carries the resolved image
--                       forward whenever this key is unchanged, so editing a
--                       quantity / reordering / tracking never triggers a new
--                       image search - only a real change of the meal's food
--                       composition re-resolves that one meal.
--
-- Runtime resolution reads PEXELS_API_KEY server-side only (never exposed to
-- the browser) and Open Food Facts (no key). The running app never calls an
-- image API at render time - it only reads these already-stored columns.
-- ---------------------------------------------------------------------------

alter table public.food_database
  add column if not exists image_status     text,
  add column if not exists image_checked_at timestamptz;

alter table public.user_supplements
  add column if not exists image_url         text,
  add column if not exists image_alt         text,
  add column if not exists image_attribution jsonb,
  add column if not exists image_status      text,
  add column if not exists image_checked_at  timestamptz;

alter table public.meals
  add column if not exists image_url             text,
  add column if not exists image_alt             text,
  add column if not exists image_attribution     jsonb,
  add column if not exists image_status          text,
  add column if not exists image_checked_at      timestamptz,
  add column if not exists image_composition_key text;

-- Verify:
-- select name, image_status, image_url from public.food_database where image_status is not null;
-- select name, image_status, image_url from public.user_supplements where image_status is not null;
-- select name, image_status, image_composition_key from public.meals where image_status is not null;
