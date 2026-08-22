-- Meal reminders & notifications foundation.
--
-- meals.reminder_time/reminder_enabled: first-class structured scheduling
-- data. Meal timing previously existed only as a free-text suffix a user
-- could type into meals.name (see AddMealModal.tsx) which was never
-- parseable - this adds a real column instead of inventing parsing rules for
-- that text.
alter table public.meals
  add column reminder_time time null,
  add column reminder_enabled boolean not null default true;

-- notification_preferences: one row per user. Kept as its own table rather
-- than bolting more columns onto profiles (which already carries 9 unrelated
-- nutrition-engine biometric columns) so it can grow with Phase 2 fields
-- (e.g. a push-opt-in flag) without further crowding profiles.
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminders_enabled boolean not null default false,
  milestones_enabled boolean not null default true,
  timezone text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.notification_preferences enable row level security;

create policy "Users can manage own notification preferences"
  on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- notification_events: durable, server-side "already sent today" ledger.
-- Deliberately NOT client-only (e.g. localStorage) - a future server-side
-- Web Push dispatcher (Phase 2) has no access to the browser's localStorage,
-- so dedup state needs one shared, transport-agnostic source of truth from
-- the start. The (user_id, local_date, event_key) unique constraint both
-- enforces "at most once per day" and provides automatic daily reset (a new
-- local_date is simply a new key - nothing to clear).
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  event_key text not null,
  event_type text not null check (event_type in ('meal_reminder', 'milestone')),
  sent_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, local_date, event_key)
);

alter table public.notification_events enable row level security;

create policy "Users can manage own notification events"
  on public.notification_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- push_subscriptions: Phase 2 (Web Push) foundation. Unused by any Phase 1
-- code - created now purely so closed-browser delivery can be added later
-- without a migration touching tables Phase 1 already depends on.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.push_subscriptions enable row level security;

create policy "Users can manage own push subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
