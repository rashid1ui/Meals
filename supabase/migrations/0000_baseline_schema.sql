-- ==============================================================================
-- Migration: 0000 - baseline schema
-- ==============================================================================
-- WHY THIS MIGRATION EXISTS
--
-- Migrations 0001-0025 are all `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
-- `ALTER POLICY`, `CREATE OR REPLACE FUNCTION`, etc. against tables, policies,
-- functions and a trigger that were created directly on the hosted Supabase
-- project and never captured in this folder (see 0002's header: "public.
-- daily_tracking and public.food_tracking already exist in the live database
-- (created outside this repo's migration history)"; 0020's references to a
-- pre-existing `handle_new_user`; the `daily_tracking.*_target` /
-- `nutrition_progress` columns that `recomputeDailyAndReturn` writes on every
-- call but no migration adds).
--
-- The practical consequence was that `supabase db reset` against this repo
-- produced a database missing every core table, so there was no way to stand
-- up a fresh/branch/local environment or verify a recovery. This file closes
-- that gap: it recreates the schema EXACTLY as it stood immediately before
-- 0001 ran, so the full `0000 -> 0027` chain replays cleanly on an empty
-- database and reproduces the current production schema.
--
-- APPLYING THIS
--
--   * Fresh / local / branch / CI database:  runs as part of
--     `supabase db reset` / `supabase db start`, in order, before 0001.
--   * The EXISTING production database (which already has this schema):  do
--     NOT execute it there. Mark it as already applied instead:
--         supabase migration repair --status applied 0000
--     Nothing below is destructive, but re-running the CREATEs on a populated
--     database is unnecessary and `repair` is the standard baseline-squash
--     workflow.
--
-- WHAT IS DELIBERATELY OMITTED (added by a later migration, so leaving it out
-- here keeps that migration's one-time statements collision-free):
--   - diet_plans.is_active / created_at / updated_at + its indexes        -> 0001
--   - food_tracking.meal_id / meal_name + FK + index                       -> 0002
--   - food_database.display_unit / grams_per_display_unit + curated rows   -> 0003
--   - food_database "Authenticated users can add foods" INSERT policy      -> 0003
--   - profiles biometrics / training / supplement / lock columns          -> 0004, 0007, 0008, 0013, 0019
--   - diet_plans nutrition-metadata columns                                -> 0005
--   - meals.reminder_time / reminder_enabled                               -> 0006
--   - notification_preferences / notification_events / push_subscriptions  -> 0006
--   - food_database.protein_type / carb_type (+ backfills)                 -> 0007, 0016
--   - diet_plans.plan_source (+ widening)                                  -> 0015, 0017
--   - food_database category widening (supplement, vegetable)             -> 0012, 0018
--   - food_database.food_database_nutrition_upper_bound                    -> 0022
--   - RLS `(select auth.uid())` performance rewrite + FK-covering indexes  -> 0023
--   - finalize_plan_swap / activate_plan_history_swap functions            -> 0020, 0021
--   - onboarding_drafts table                                             -> 0025
--
-- Reconstructed from a live read-only introspection of production
-- (information_schema + pg_catalog): every table, column, default, NOT NULL,
-- CHECK / UNIQUE / PK / FK (with ON DELETE rules), every index, RLS
-- enablement, every policy, and the handle_new_user function + trigger.
-- ==============================================================================

-- ==============================================================================
-- profiles
-- ==============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  avatar_url  text,
  created_at  timestamptz default timezone('utc'::text, now()),
  updated_at  timestamptz default timezone('utc'::text, now())
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile"   on public.profiles;
drop policy if exists "Users can update own profile"  on public.profiles;
drop policy if exists "Users can insert own profile"  on public.profiles;
create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"  on public.profiles for insert with check (auth.uid() = id);

-- ==============================================================================
-- diet_plans  (pre-0001: no is_active / created_at / updated_at / metadata)
-- ==============================================================================
create table if not exists public.diet_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  calories_target integer not null default 2254,
  protein_target  integer not null default 153,
  carbs_target    integer not null default 251,
  fat_target      integer not null default 71,
  constraint diet_plans_id_user_id_key unique (id, user_id)
);

create index if not exists idx_diet_plans_user_id on public.diet_plans (user_id);

alter table public.diet_plans enable row level security;
drop policy if exists "Users can manage own diet plans" on public.diet_plans;
create policy "Users can manage own diet plans" on public.diet_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- meals  (pre-0006: no reminder_time / reminder_enabled)
-- ==============================================================================
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  diet_plan_id uuid,
  name         text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz default timezone('utc'::text, now()),
  constraint meals_id_user_id_key unique (id, user_id),
  constraint meals_diet_plan_id_user_id_fkey
    foreign key (diet_plan_id, user_id)
    references public.diet_plans (id, user_id) on delete cascade
);

create index if not exists idx_meals_user_id on public.meals (user_id);
create index if not exists idx_meals_diet_plan_id on public.meals (diet_plan_id);

alter table public.meals enable row level security;
drop policy if exists "Users can manage own meals" on public.meals;
create policy "Users can manage own meals" on public.meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- foods
-- ==============================================================================
create table if not exists public.foods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  meal_id    uuid not null,
  name       text not null,
  quantity   numeric not null,
  unit       text not null,
  protein    numeric not null,
  fat        numeric not null,
  carbs      numeric not null,
  calories   numeric not null,
  sort_order integer not null default 0,
  created_at timestamptz default timezone('utc'::text, now()),
  constraint foods_id_user_id_key unique (id, user_id),
  constraint foods_meal_id_user_id_fkey
    foreign key (meal_id, user_id)
    references public.meals (id, user_id) on delete cascade
);

create index if not exists idx_foods_user_id on public.foods (user_id);
create index if not exists idx_foods_meal_id on public.foods (meal_id);

alter table public.foods enable row level security;
drop policy if exists "Users can manage own foods" on public.foods;
create policy "Users can manage own foods" on public.foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- food_database  (pre-0003: no display_unit / grams_per_display_unit;
-- pre-0007/0016: no protein_type / carb_type; pre-0012/0018 category set)
-- ==============================================================================
create table if not exists public.food_database (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null,
  serving_size numeric not null default 100,
  serving_unit text not null default 'grams',
  calories     numeric not null default 0,
  protein      numeric not null default 0,
  carbs        numeric not null default 0,
  fat          numeric not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz default now(),
  constraint food_database_name_unique unique (name),
  constraint food_database_category_valid
    check (category = any (array['protein','dairy','carbohydrate','fruit','fat'])),
  constraint food_database_serving_unit_valid
    check (serving_unit = any (array['grams','ml'])),
  constraint food_database_serving_size_positive check (serving_size > 0),
  constraint food_database_nutrition_nonnegative
    check (calories >= 0 and protein >= 0 and carbs >= 0 and fat >= 0)
);

alter table public.food_database enable row level security;
drop policy if exists "Authenticated users can view active foods" on public.food_database;
create policy "Authenticated users can view active foods" on public.food_database
  for select to authenticated using (is_active = true);

-- ==============================================================================
-- daily_tracking  (already present in production before 0001; the *_target
-- and nutrition_progress columns were added out-of-band and are captured here)
-- ==============================================================================
create table if not exists public.daily_tracking (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  tracking_date      date not null,
  calories           numeric default 0,
  protein            numeric default 0,
  carbs              numeric default 0,
  fat                numeric default 0,
  nutrition_progress numeric default 0,
  calories_target    integer not null,
  protein_target     integer not null,
  carbs_target       integer not null,
  fat_target         integer not null,
  created_at         timestamptz default timezone('utc'::text, now()),
  updated_at         timestamptz default timezone('utc'::text, now()),
  constraint daily_tracking_user_id_tracking_date_key unique (user_id, tracking_date)
);

create index if not exists idx_daily_tracking_user_date on public.daily_tracking (user_id, tracking_date);

alter table public.daily_tracking enable row level security;
drop policy if exists "Users can manage own daily tracking" on public.daily_tracking;
create policy "Users can manage own daily tracking" on public.daily_tracking
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- food_tracking  (already present in production before 0001; pre-0002: no
-- meal_id / meal_name)
-- ==============================================================================
create table if not exists public.food_tracking (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  tracking_date date not null,
  food_id       uuid,
  completed     boolean default false,
  quantity      numeric not null,
  food_name     text not null,
  protein       numeric not null,
  fat           numeric not null,
  carbs         numeric not null,
  calories      numeric not null,
  created_at    timestamptz default timezone('utc'::text, now()),
  updated_at    timestamptz default timezone('utc'::text, now()),
  constraint food_tracking_user_id_tracking_date_food_id_key unique (user_id, tracking_date, food_id),
  constraint food_tracking_food_id_user_id_fkey
    foreign key (food_id, user_id)
    references public.foods (id, user_id) on delete set null (food_id)
);

create index if not exists idx_food_tracking_food_id on public.food_tracking (food_id);
create index if not exists idx_food_tracking_user_date on public.food_tracking (user_id, tracking_date);

alter table public.food_tracking enable row level security;
drop policy if exists "Users can manage own food tracking" on public.food_tracking;
create policy "Users can manage own food tracking" on public.food_tracking
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- handle_new_user() + trigger  (bootstrap a profiles row on auth signup)
-- ==============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
