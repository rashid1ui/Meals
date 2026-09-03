# Meals

Gym meal-planning and daily nutrition tracking. Next.js 16 (App Router) + React 19,
Supabase (Postgres + Auth + RLS), DeepSeek for AI meal-plan generation, Web Push
for reminders.

> **Read `AGENTS.md` first.** This repo runs a modified Next.js 16 where
> `middleware` is `proxy` (`proxy.ts`) and other conventions differ from older
> Next. Check `node_modules/next/dist/docs/` before writing framework code.

---

## Setup

Requirements: Node **>= 22** (`.nvmrc`), Docker (for the local Supabase stack),
and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
nvm use            # Node 22
npm ci
cp .env.example .env.local   # then fill in the values below
```

### Environment variables

All are documented inline in `.env.example`. Summary:

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | used **only** by `lib/supabase/admin.ts` (the notifications cron); bypasses RLS |
| `DEEPSEEK_API_KEY` | server only | AI meal-plan generation (`lib/diet/generate-diet.ts`) |
| `CRON_SECRET` | server only | `Authorization: Bearer <value>` for `/api/cron/notifications`; the route **fails closed** if unset |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Web Push | `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_SITE_URL` | client | canonical origin for the OAuth redirect (`lib/auth/routing.ts`) — must not be a Vercel preview URL |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | build | fixed value in prod so Server Action ids stay stable across deploys; leave blank locally |

Leave `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` blank locally — `next dev` generates
its own ephemeral key.

---

## Database

The full schema lives in `supabase/migrations/`, applied in filename order:

- **`0000_baseline_schema.sql`** — every core table, constraint, index, RLS
  policy, and the `handle_new_user` trigger. Rebuilt from a production
  introspection; represents the state immediately before `0001`.
- **`0001`–`0026`** — incremental `ALTER`s / new tables / functions, each with a
  header explaining why it exists.
- **`0027_user_supplements.sql`** — Vitamins & Supplements tracker: adds
  `user_supplements` (free-text name, dose/dose_unit, quantity/quantity_unit,
  frequency, one or more reminder `times`, start/end date, notes,
  `notification_enabled`), RLS-scoped to `auth.uid() = user_id`, and widens
  `notification_events.event_type` to accept `supplement_reminder`.
- **`0028`+** — new work starts here.

Every migration is written to be safe to run against production (idempotent
guards throughout) and is applied via the Supabase CLI or dashboard — nothing in
this repo applies them automatically.

```bash
supabase start          # boots Postgres + auth and applies migrations/*.sql + seed.sql
supabase db reset        # rebuild from scratch (migrations + seed)
```

`supabase/seed.sql` seeds the shared `food_database` catalog (USDA per-100g).

CI (`.github/workflows/ci.yml`, `database` job) runs `supabase db start` on every
PR, so a broken or out-of-order migration fails the build.

---

## Architecture

```
app/                      Next.js routes, pages, server actions ('use server')
  dashboard/               the active diet: edit plan + track what was eaten
    tracking-actions.ts     DB wrapper around lib/tracking/logic.ts
    actions.ts              saveDietPlan (edit) -> finalize_plan_swap RPC
    food-actions.ts         add a shared-catalog food
  onboarding/              the wizard: profile -> targets -> foods -> plan
    actions.ts              submitOnboarding (AI generation path)
    manual-actions.ts       createManualDietPlan (hand-built path)
  api/cron/notifications/   Web Push sweep (Vercel Cron / GitHub Actions)
lib/
  nutrition/               PURE: engine (BMR/TDEE/macros), calculator, solver, units
  diet/                    PURE: diff, save-plan, effective-target, generate-diet, supplements
  tracking/                PURE: logic, date, optimisticTracking
  notifications/           schedule, milestones, copy, timezone, sweep, push
                            supplementSchedule/supplementCopy, useSupplementReminders
  supplements/             PURE: validation (dose/quantity/frequency/times/dates)
                            + actions.ts (CRUD + notification toggle, 'use server')
  supabase/                server.ts (RLS client), admin.ts (service role), middleware.ts
supabase/migrations/      the schema (see above)
components/supplements/   shared form/list-item UI, used by both the dashboard
                            and the onboarding "Vitamins & Supplements" step
```

**Vitamins & Supplements:** a user-owned, freely-named list (`user_supplements`
— no fixed catalog) with its own dose/quantity/frequency/reminder times/notes
and a per-row `notification_enabled` switch. Reuses the meal-reminder
notification architecture end to end rather than a second system: the same
`notification_events` dedup ledger (keyed `supplement_reminder:<id>:<time>`),
the same client-side `Notification` tick (`useSupplementReminders`, gated only
on browser permission — independent of the meal-reminders master switch), and
the same cron sweep (`app/api/cron/notifications/route.ts`) for closed-browser
Web Push, swept as its own user population since a supplement's notification
setting is independent of `notification_preferences.reminders_enabled`.
Managed from the Dashboard and Settings (`SupplementsSection`, shared with
onboarding's optional, skippable "Vitamins & Supplements" step via
`components/supplements/`).

**The rule:** framework-free logic lives in `lib/**` and is unit-tested there;
`'use server'` files are thin — they authenticate, load reference data, call the
pure functions, and persist. Multi-table atomic mutations are Postgres functions
(`finalize_plan_swap`, `activate_plan_history_swap`) because the JS client has no
transaction API.

**Data flow (plan → eaten → dashboard):** `diet_plans` → `meals` → `foods`
(denormalized absolute macros) → one `food_tracking` row per
`(user, date, food)` holding the *actual* consumed amount → `getTodayTracking`
builds each meal's `actual` from foods in the **current live plan** that are
marked completed today, and `consumed` is the sum of those meal totals (never a
raw sum over `food_tracking`, which can carry orphaned rows from a plan edit).
The `daily_tracking` row is a per-day snapshot of that same figure, for the
Insights charts. Every daily number has one source of truth.

Auth: every server action calls `getUser()` (hits the auth server, not just a
cookie) and every query is `user_id`-scoped on top of RLS.

---

## Commands

```bash
npm run dev        # next dev
npm run build      # next build
npm run lint       # eslint
npm test           # unit tests (lib/**, pure logic) — ~490 tests, runs in CI
npx tsc --noEmit   # type-check

# Integration tests — need a live/local Supabase in .env.local, NOT in `npm test`:
npm run test:audit                 # calls the real DeepSeek API (costs money)
npm run test:manual-plan
npm run test:supplement-db
npm run test:user-supplements       # user_supplements RLS: own-row CRUD + cross-user isolation
npm run test:production-hardening   # finalize_plan_swap, manual-plan lock, supplement catalog
```

---

## Deploy

Vercel (`vercel.json`). Set all env vars in the Vercel dashboard for Production,
Preview, and Development. Apply any new `supabase/migrations/*.sql` to the
project via the Supabase CLI/dashboard **before or with** the deploy that needs
them. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be set once and never rotated.
