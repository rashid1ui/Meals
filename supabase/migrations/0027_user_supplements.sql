-- ==============================================================================
-- Migration: Vitamins & Supplements tracker
-- ==============================================================================
-- Adds user_supplements: user-owned, freely-named vitamin/mineral/supplement
-- entries with their own dose, schedule, and notification setting. This is a
-- distinct concept from food_database's category='supplement' rows
-- (migrations 0008/0012/0014) - those are trackable FOODS consumed as part
-- of a meal plan (whey, creatine) with real macros. user_supplements rows
-- are never eaten as tracked food and carry no macros; they exist purely to
-- schedule "take your vitamin D3" reminders, independent of any diet plan.
--
-- `times` reuses the existing reminder_time column type (time, "HH:MM" wall
-- clock - see migration 0006_meal_reminders.sql) as a time[] array, since a
-- single supplement can have multiple daily reminder times (spec section 11)
-- - one array column rather than a separate child table, since a time here
-- carries no other attributes of its own (unlike meals, which have foods).
--
-- notification_events.event_type is widened to also accept
-- 'supplement_reminder' so the cron/client dedup ledger (see
-- lib/notifications/actions.ts's claimNotificationEvent) can claim
-- supplement reminders through the exact same table/mechanism meal
-- reminders and milestones already use, per spec section 9's "reuse the
-- existing notification infrastructure".
-- ==============================================================================

create table if not exists public.user_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose numeric,
  dose_unit text,
  quantity numeric not null default 1,
  quantity_unit text not null default 'capsule',
  frequency text not null default 'once_daily'
    check (frequency in ('once_daily', 'twice_daily', 'three_times_daily', 'custom')),
  -- Wall-clock local reminder times, "HH:MM" each - always at least one.
  -- Never assumed to be UTC; fired against the user's own local clock
  -- client-side (lib/notifications/useSupplementReminders.ts) and against
  -- notification_preferences.timezone server-side (the cron), exactly like
  -- meals.reminder_time.
  times time[] not null default array[]::time[],
  start_date date not null default (timezone('utc'::text, now()))::date,
  -- NULL end_date means ongoing/ no end date configured.
  end_date date,
  notes text,
  notification_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint user_supplements_name_not_blank check (char_length(btrim(name)) > 0),
  constraint user_supplements_dose_nonnegative check (dose is null or dose >= 0),
  constraint user_supplements_quantity_positive check (quantity > 0),
  constraint user_supplements_has_times check (array_length(times, 1) is not null and array_length(times, 1) > 0),
  constraint user_supplements_end_after_start check (end_date is null or end_date >= start_date)
);

-- Every list/reminder query filters by user_id first (see
-- lib/supplements/actions.ts, lib/notifications/admin.ts) - this is the
-- single index that matters for this table, mirroring
-- notification_preferences/push_subscriptions' own user_id indexing.
create index if not exists user_supplements_user_id_idx on public.user_supplements(user_id);

-- Narrows the cron's "which users need a supplement sweep at all" scan
-- (lib/notifications/admin.ts's getUsersWithSupplementRemindersEnabled) to
-- only the rows that can ever fire a reminder, without touching every
-- disabled/paused supplement row on every tick.
create index if not exists user_supplements_notification_enabled_idx
  on public.user_supplements(user_id) where notification_enabled = true;

alter table public.user_supplements enable row level security;

-- Same ownership pattern as notification_preferences/push_subscriptions
-- (migration 0006): a user may only ever see/change their own rows, for
-- every operation, with no exceptions - there is no shared/public
-- supplement catalog to also expose here.
create policy "Users can manage own supplements"
  on public.user_supplements
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Widen the existing dedup-ledger check constraint (migration
-- 0006_meal_reminders.sql) to also accept supplement reminders, so
-- claimNotificationEvent/claimNotificationEventForUser can record them
-- through the exact same (user_id, local_date, event_key) unique-constraint
-- claim every other notification type already relies on.
alter table public.notification_events drop constraint if exists notification_events_event_type_check;
alter table public.notification_events
  add constraint notification_events_event_type_check
  check (event_type in ('meal_reminder', 'milestone', 'supplement_reminder'));
