-- ==============================================================================
-- Migration: AI Outside-Plan Food Scanner - schema
-- ==============================================================================
-- Adds outside_plan_food_entries and food_scan_events, plus four new columns
-- on daily_tracking, per the approved design in
-- /Users/mohamed/.claude/plans/i-want-to-design-sequential-lark.md (Question 1/2).
--
-- Deliberately NOT an extension of food_tracking: every existing food_tracking
-- row is anchored to a real foods/meals row from the active diet plan (see
-- 0000_baseline_schema.sql's food_tracking_food_id_user_id_fkey and
-- app/dashboard/tracking-actions.ts), and finalize_plan_swap (0020/0026)
-- relinks food_tracking rows by id on every plan save. Outside-plan food has
-- no such anchor by definition - it's food the user ate that was never part
-- of any plan - so it gets its own table with zero shared invariants, the
-- same choice this project already made for supplements (user_supplements /
-- supplement_tracking, 0027/0028) rather than folding them into
-- food_database / food_tracking.
--
-- outside_plan_food_entries is the confirmed, user-reviewed log entry - the
-- only thing tracking/analytics ever reads. Nothing is written here until the
-- user explicitly confirms (AI output alone never creates a row).
--
-- food_scan_events is both a usage/audit ledger (so daily/monthly AI-call
-- rate limits count every attempt, not just confirmed entries - otherwise a
-- user could scan endlessly and just never confirm) AND the AI-result cache:
-- ai_response stores the full validated structured result at analysis time,
-- independent of whether the scan is ever confirmed, so a resubmission of an
-- identical photo can be served from cache even after the original Storage
-- object has already been deleted (e.g. the user cancelled). A same-request
-- dedup check alone could not cover that case.
--
-- daily_tracking's existing calories/protein/carbs/fat columns become the
-- TRUE daily total (planned + outside-plan combined) - the correct meaning
-- for a "calories eaten today" number - while the new outside_plan_* columns
-- hold just the outside-plan portion, so "planned portion" stays cleanly
-- derivable as total minus outside_plan_*. nutrition_progress's formula is
-- unchanged; it now correctly reflects true intake.
-- ==============================================================================

create table if not exists public.outside_plan_food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracking_date date not null,
  -- Actual capture/confirm time, distinct from the tracking_date bucket -
  -- lets analytics answer "what time of day" without conflating the two.
  logged_at timestamptz not null default timezone('utc'::text, now()),
  -- Display-only grouping label. Never a FK to meals - an outside-plan entry
  -- must never imply membership in any planned meal (design principle 2/7).
  meal_context text check (meal_context is null or meal_context in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- Supports both the photo-scanned flow and the "just type it in" manual
  -- fallback (Q6) in one table, rather than a second parallel table.
  source text not null check (source in ('ai_scan', 'manual')),
  item_name text not null,
  -- Free-text portion description for display only (e.g. "1 regular burger,
  -- medium fries") - never used in any calculation.
  quantity_description text,
  -- Detected/edited sub-items: [{name, estimated_grams, calories, protein,
  -- carbs, fat, confidence}]. JSONB because nothing in the approved
  -- analytics design (Q8/Q9) queries into individual components - only
  -- entry-level totals - so a child table would be pure ceremony for v1.
  components jsonb not null default '[]'::jsonb,
  quantity_value numeric check (quantity_value is null or quantity_value >= 0),
  quantity_unit text check (quantity_unit is null or quantity_unit in ('g', 'ml')),
  -- Final values used everywhere (post user-edit, if edited) - normalized
  -- columns because analytics/dashboards need SUM()/AVG() over these, the
  -- same reason food_tracking stores its own final numbers as columns.
  calories numeric not null check (calories >= 0 and calories <= 5000),
  protein numeric not null check (protein >= 0 and protein <= 500),
  carbs numeric not null check (carbs >= 0 and carbs <= 500),
  fat numeric not null check (fat >= 0 and fat <= 500),
  -- Provider identity kept as free text (not an enum) so a future
  -- VisionProvider implementation other than Kimi needs no schema change.
  ai_model text,
  ai_confidence text check (ai_confidence is null or ai_confidence in ('high', 'medium', 'low')),
  -- The schema-validated AI output exactly as returned, kept for
  -- audit/debugging/future re-processing - never read for calculations
  -- after confirm (the normalized columns above are always authoritative).
  ai_raw_response jsonb,
  -- Quality-feedback signal: true if the user changed any AI-estimated
  -- value before confirming.
  was_edited boolean not null default false,
  -- Storage object key; NULL once purged by the 90-day retention job or if
  -- source = 'manual'. image_deleted_at keeps auditability that a photo HAD
  -- existed without leaving a dangling reference once it's gone.
  image_storage_path text,
  image_deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint outside_plan_food_entries_item_name_not_blank check (char_length(btrim(item_name)) > 0),
  constraint outside_plan_food_entries_components_is_array check (jsonb_typeof(components) = 'array')
);

-- Mirrors food_tracking/daily_tracking's own (user_id, tracking_date)
-- indexing - every daily/weekly/monthly read filters by this pair first.
create index if not exists outside_plan_food_entries_user_date_idx
  on public.outside_plan_food_entries (user_id, tracking_date);
-- "Recent scans" / dashboard-ordering access pattern.
create index if not exists outside_plan_food_entries_user_created_idx
  on public.outside_plan_food_entries (user_id, created_at desc);

alter table public.outside_plan_food_entries enable row level security;

-- Same ownership pattern as every other user-owned table in this project
-- (food_tracking, user_supplements, supplement_tracking): a user may only
-- ever read/write their own rows, for every operation.
create policy "Users can manage own outside-plan food entries"
  on public.outside_plan_food_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.food_scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  status text not null check (status in ('succeeded', 'failed', 'timeout', 'rejected_invalid_output', 'served_from_cache')),
  -- SHA-256 of the compressed image bytes - both the duplicate-submission
  -- guard and the cache lookup key (see migration header above).
  image_hash text,
  ai_model text,
  -- The full schema-validated structured result, stored regardless of
  -- whether the scan is ever confirmed - this IS the cache payload. A
  -- scheduled job nulls this out ~48h after creation so no scan's
  -- description lingers indefinitely just because it was never confirmed;
  -- the row itself is kept for quota-history counting.
  ai_response jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_message text,
  -- Populated only if the scan was confirmed into a tracking entry.
  resulting_entry_id uuid references public.outside_plan_food_entries(id) on delete set null
);

-- Rolling daily/monthly AI-call quota counts (Q10) filter by this pair.
create index if not exists food_scan_events_user_created_idx
  on public.food_scan_events (user_id, created_at);
-- The cache-lookup query: latest succeeded event for this user+image hash.
create index if not exists food_scan_events_user_hash_created_idx
  on public.food_scan_events (user_id, image_hash, created_at desc);

alter table public.food_scan_events enable row level security;

-- Same per-user ownership pattern. All writes happen server-side (the
-- client never inserts into this table directly), but RLS is still the
-- backstop, exactly like every other user-owned table here.
create policy "Users can manage own food scan events"
  on public.food_scan_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- daily_tracking: add the outside-plan portion columns. The pre-existing
-- calories/protein/carbs/fat columns are re-purposed in application code
-- (app/dashboard/tracking-actions.ts's recomputeDailyAndReturn) to mean the
-- TRUE total (planned + outside-plan) - no schema change needed for that,
-- since those columns already just hold "consumed" numerics with no
-- constraint tying them to planned-only sources.
alter table public.daily_tracking
  add column if not exists outside_plan_calories numeric default 0,
  add column if not exists outside_plan_protein numeric default 0,
  add column if not exists outside_plan_carbs numeric default 0,
  add column if not exists outside_plan_fat numeric default 0;
