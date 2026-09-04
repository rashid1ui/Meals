-- ==============================================================================
-- Migration: Daily supplement dose tracking
-- ==============================================================================
-- Adds supplement_tracking: the food_tracking equivalent for the Vitamins &
-- Supplements feature (migration 0027). A supplement existing, or having its
-- reminder enabled, is NOT completion - the user must explicitly mark each
-- individually-scheduled dose as taken, exactly like food_tracking's
-- per-food "completed" rows. One row per (user, supplement, date, scheduled
-- time) - a supplement with times = ['13:00', '20:00'] gets TWO independent
-- daily dose targets, never collapsed into one.
--
-- Mirrors food_tracking's own design (supabase/migrations/0000_baseline_schema.sql):
--   - `completed` is the source of truth for whether a dose counts toward
--     today's target, same as food_tracking.completed.
--   - user_supplement_id is nullable and ON DELETE SET NULL (not CASCADE) -
--     deleting a supplement preserves its historical tracking rows instead
--     of destroying them, the same choice food_tracking made for food_id.
--   - the (user_id, user_supplement_id, tracking_date, scheduled_time)
--     unique constraint is both the idempotency guard (a lazy/upsert-based
--     initializer can never create a duplicate expected-dose row, and a
--     double-submitted toggle can never create a duplicate completion row)
--     and the ON CONFLICT target every write in
--     lib/supplements/trackingActions.ts uses.
--
-- notification_enabled (on user_supplements) is NEVER read by this table or
-- by the tracking actions that write to it - reminders and completion
-- tracking are deliberately independent concerns (spec section 15).
-- ==============================================================================

create table if not exists public.supplement_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_supplement_id uuid references public.user_supplements(id) on delete set null,
  tracking_date date not null,
  scheduled_time time not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  -- Keeps completed_at meaningful rather than a free-floating timestamp that
  -- could disagree with `completed` - every write in
  -- lib/supplements/tracking.ts's buildSupplementTrackingRow sets both
  -- together from the same completed flag.
  constraint supplement_tracking_completed_at_consistent check (
    (completed = true and completed_at is not null) or (completed = false and completed_at is null)
  ),
  constraint supplement_tracking_unique_dose
    unique (user_id, user_supplement_id, tracking_date, scheduled_time)
);

-- The one query every dashboard/settings load needs: "this user's tracking
-- rows for today" (see getTodaySupplementTracking).
create index if not exists supplement_tracking_user_date_idx on public.supplement_tracking(user_id, tracking_date);
create index if not exists supplement_tracking_supplement_idx on public.supplement_tracking(user_supplement_id);

alter table public.supplement_tracking enable row level security;

-- Same ownership pattern as every other user-owned table in this project
-- (food_tracking, user_supplements, notification_preferences): a user may
-- only ever read/write their own rows, for every operation.
create policy "Users can manage own supplement tracking"
  on public.supplement_tracking
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
