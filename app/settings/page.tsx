import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import Card from '@/components/ui/Card'
import Avatar from '@/components/Avatar'
import { ChevronLeftIcon } from '@/components/ui/icons'
import GenerateNewPlanButton from './GenerateNewPlanButton'
import ResetAccountButton from './ResetAccountButton'
import NotificationSettings from './NotificationSettings'
import { getReminderSchedule } from '@/lib/notifications/actions'
import SupplementsSection from '@/app/dashboard/components/SupplementsSection'
import { getSupplements } from '@/lib/supplements/actions'

export default async function SettingsPage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Read-only: same active-plan lookup pattern already used on the
  // Dashboard, just narrowed to the columns this page actually displays.
  // No write path here - Generate New Plan still goes through onboarding's
  // existing submitOnboarding action untouched.
  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('name, calories_target, protein_target, carbs_target, fat_target, plan_source')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activePlan = activePlans?.[0]

  const reminderScheduleResult = await getReminderSchedule()
  const reminderSchedule = 'data' in reminderScheduleResult ? reminderScheduleResult.data : null

  const supplementsResult = await getSupplements()
  const initialSupplements = 'data' in supplementsResult ? supplementsResult.data : []

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header
        userName={profile?.full_name || 'Athlete'}
        userEmail={user.email || ''}
        avatarUrl={profile?.avatar_url}
        avatarFallback={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
      />

      <div className="max-w-3xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Settings</h1>
          <Link
            href="/dashboard"
            className="min-h-[44px] flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
          >
            <ChevronLeftIcon size={16} />
            Back to Dashboard
          </Link>
        </div>

        {/* Account */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Account</h2>
          <Card className="p-6 flex items-center gap-4">
            <Avatar
              src={profile?.avatar_url}
              alt="Avatar"
              fallbackText={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
              size={56}
            />
            <div className="min-w-0">
              <div className="font-display text-lg font-bold text-foreground truncate">
                {profile?.full_name || 'Athlete'}
              </div>
              <div className="text-sm text-muted-foreground truncate">{user.email}</div>
            </div>
          </Card>
        </section>

        {/* Meal Plan */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Meal Plan</h2>
          <Card className="p-6 space-y-6">
            {activePlan && (
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className="text-sm font-semibold text-foreground">{activePlan.name}</div>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1.5 py-0.5 rounded bg-surface-elevated border border-border">
                    {/* Exhaustive over all three plan_source values (see
                        migration 0017_diet_plans_plan_source_user_created.sql) -
                        the previous binary ternary treated anything that
                        wasn't literally 'user_customized' as "AI Generated",
                        which mislabeled every 'user_created' (Manual Meal
                        Builder) plan - the only reachable plan-creation path
                        today, since AI generation is "Coming Soon". */}
                    {activePlan.plan_source === 'user_customized'
                      ? 'Customized by you'
                      : activePlan.plan_source === 'user_created'
                        ? 'Created by you'
                        : 'AI Generated'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3 font-mono tabular-nums text-center text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground font-sans mb-0.5">Calories</div>
                    <div className="font-semibold text-calories">{activePlan.calories_target}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-sans mb-0.5">Protein</div>
                    <div className="font-semibold text-protein">{activePlan.protein_target}g</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-sans mb-0.5">Carbs</div>
                    <div className="font-semibold text-carbs">{activePlan.carbs_target}g</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-sans mb-0.5">Fat</div>
                    <div className="font-semibold text-fat">{activePlan.fat_target}g</div>
                  </div>
                </div>
              </div>
            )}

            <div className={activePlan ? 'pt-5 border-t border-border' : ''}>
              <p className="text-sm text-muted-foreground mb-4">
                Start over with new nutrition targets and food preferences.
              </p>
              <GenerateNewPlanButton />
            </div>
          </Card>
        </section>

        {/* Meal Reminders */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Meal Reminders</h2>
          <Card className="p-6">
            <NotificationSettings
              initialMeals={reminderSchedule?.meals ?? []}
              initialPreferences={
                reminderSchedule?.preferences ?? { remindersEnabled: false, milestonesEnabled: true, timezone: null }
              }
            />
          </Card>
        </section>

        {/* Vitamins & Supplements */}
        <section className="space-y-3">
          <SupplementsSection initialSupplements={initialSupplements} />
        </section>

        {/* Danger Zone */}
        <section className="space-y-3 mt-12">
          <h2 className="text-xs font-bold uppercase tracking-wide text-error">Danger Zone</h2>
          <Card className="p-6 border-error/20 bg-error/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-foreground mb-1">Start Fresh</div>
                <p className="text-sm text-muted-foreground">
                  Reset your Gym Meals data and start again from the beginning.
                </p>
              </div>
              <div className="shrink-0">
                <ResetAccountButton />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  )
}
