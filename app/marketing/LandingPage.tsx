// Public marketing landing page, rendered by app/page.tsx for logged-out
// visitors only (an authenticated user hitting "/" still gets the existing
// redirect to /dashboard or /onboarding, unchanged). A Server Component -
// the only client-side piece on the whole page is LandingNav's mobile menu
// toggle; every product "screenshot" below is a static recreation built
// from the same primitives (Card, Badge, design tokens) the real dashboard
// uses, not an imported dashboard component (those are wired to live
// Supabase data/callbacks and can't render for an anonymous visitor) and
// not stock imagery.
import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import LinkButton from '@/components/ui/LinkButton'
import LandingNav from './LandingNav'
import {
  PlusIcon,
  TargetIcon,
  SearchIcon,
  ScaleIcon,
  SwapIcon,
  DumbbellIcon,
  PillIcon,
  ChartIcon,
  TrendingUpIcon,
  CheckIcon,
  CloseIcon,
  type IconProps
} from '@/components/ui/icons'

function Section({
  id,
  children,
  className = '',
  ariaLabel
}: {
  id?: string
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <section id={id} aria-label={ariaLabel} className={`scroll-mt-24 py-16 sm:py-24 ${className}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-pill border bg-primary/15 text-primary border-primary/30">
      {children}
    </p>
  )
}

function SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl mb-10 sm:mb-14">
      {eyebrow && (
        <div className="mb-3">
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2 className="font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground text-balance">
        {title}
      </h2>
      {description && <p className="mt-4 text-base text-muted-foreground">{description}</p>}
    </div>
  )
}

// ---- Hero product visual - static recreation of DailyProgress.tsx's exact
// classes/structure (CalorieHero + macro tiles), illustrative numbers only.
function HeroProductPreview() {
  return (
    <Card elevated className="p-5 sm:p-6 w-full max-w-md space-y-4" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s Progress
        </span>
        <Badge variant="success">On Target</Badge>
      </div>
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono tabular-nums text-4xl font-bold text-calories">1,840</span>
          <span className="text-muted-foreground">/ 2,400 kcal</span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-elevated border border-border overflow-hidden mt-3">
          <div className="h-full rounded-full bg-calories" style={{ width: '77%' }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Protein', value: 142, target: 180, valueClass: 'text-protein', barClass: 'bg-protein', pct: 79 },
          { label: 'Carbs', value: 165, target: 230, valueClass: 'text-carbs', barClass: 'bg-carbs', pct: 72 },
          { label: 'Fat', value: 48, target: 70, valueClass: 'text-fat', barClass: 'bg-fat', pct: 69 }
        ].map(m => (
          <div key={m.label} className="p-3 rounded-card border border-border bg-surface space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {m.label}
            </span>
            <div className={`font-mono tabular-nums text-base font-bold ${m.valueClass}`}>
              {m.value}
              <span className="text-muted-foreground text-xs font-normal">/{m.target}g</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden">
              <div className={`h-full rounded-full ${m.barClass}`} style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Illustrative preview of your daily dashboard</p>
    </Card>
  )
}

// ---- Feature grid
type Feature = { Icon: (props: IconProps) => ReactNode; title: string; description: string }

const FEATURES: Feature[] = [
  {
    Icon: PlusIcon,
    title: 'Build Your Own Meal Plan',
    description: 'Create meals manually and choose exactly what you eat, food by food.'
  },
  {
    Icon: TargetIcon,
    title: 'Personalized Nutrition Targets',
    description: 'Calorie, protein, carb, and fat targets calculated from your profile and goal.'
  },
  {
    Icon: SearchIcon,
    title: 'Complete Food Library',
    description: 'Browse protein, carbohydrate, fat, vegetable, fruit, and supplement sources.'
  },
  {
    Icon: ScaleIcon,
    title: 'Flexible Portions',
    description: 'Change planned quantities whenever you want - nothing is locked in.'
  },
  {
    Icon: SwapIcon,
    title: 'Move Foods Between Meals',
    description: 'Move foods between breakfast, lunch, dinner, pre-workout, and post-workout.'
  },
  {
    Icon: DumbbellIcon,
    title: 'Workout Nutrition',
    description: 'Pre- and post-workout nutrition, kept separate from your main meals.'
  },
  {
    Icon: PillIcon,
    title: 'Supplement Tracking',
    description: 'Whey, creatine, and other supplements, with the correct macro behavior for each.'
  },
  {
    Icon: ChartIcon,
    title: 'Nutrition Insights',
    description: 'See animal vs. plant protein, macro trends, calories, and workout nutrition at a glance.'
  },
  {
    Icon: TrendingUpIcon,
    title: 'Progress Tracking',
    description: 'Weight, measurements, and progress photos - built for the check-ins ahead.'
  }
]

// ---- How it works
const STEPS = [
  {
    title: 'Tell us about yourself',
    description: 'Age, weight, height, activity level, and goal - the same profile the rest of the app runs on.'
  },
  {
    title: 'Set your nutrition targets',
    description: 'Your calorie and macro targets are calculated from that profile - no separate spreadsheet or app.'
  },
  {
    title: 'Build your meal plan',
    description: 'Pick real foods and real portions, organized into the meals your day actually looks like.'
  },
  {
    title: 'Track, adjust, and improve',
    description: 'Log what you actually eat, compare it to plan, and change anything whenever you want.'
  }
]

// ---- Trust section
const TRUST_POINTS = [
  { title: 'Transparent nutrition calculations', description: 'Targets and totals are computed from values you can see, never a black box.' },
  { title: 'Editable meal plans', description: 'Nothing about a saved plan is permanent - foods, portions, and meals stay editable.' },
  { title: 'Separate planned vs. eaten tracking', description: 'What you planned and what you actually logged are always kept distinct.' },
  { title: 'Secure, user-specific data', description: 'Your nutrition data is tied to your own account and only accessible to you.' },
  { title: 'Flexible nutrition workflows', description: 'Main meals, workout nutrition, and supplements each work the way they actually behave.' }
]

const FAQ_ITEMS = [
  {
    question: 'Is the meal plan built by AI?',
    answer:
      "Not yet. Today's meal plan is fully manual - you choose every food and portion yourself. AI-assisted planning is on the roadmap, not a current feature."
  },
  {
    question: 'Can I change my plan after I create it?',
    answer: 'Yes. Add, remove, or move foods and meals, and adjust portions any time - nothing is locked once your plan is saved.'
  },
  {
    question: 'How are my calorie and macro targets calculated?',
    answer: 'From the profile and goal you set during onboarding, so you get real targets without doing the math yourself.'
  },
  {
    question: 'Do you support supplements like whey and creatine?',
    answer:
      'Yes - supplements are tracked with the correct macro behavior. Whey counts toward your protein and calories; creatine never does.'
  },
  {
    question: 'Is my data private?',
    answer: 'Your nutrition data is tied to your own account and only accessible to you.'
  }
]

export default function LandingPage() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-pill focus:bg-accent focus:text-accent-foreground focus:font-bold"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main-content" className="bg-background text-foreground">
        {/* Hero */}
        <Section className="pt-12 sm:pt-16">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <Eyebrow>Manual meal planning - available now</Eyebrow>
              <h1 className="mt-4 font-display font-medium text-4xl sm:text-5xl lg:text-[3.25rem] leading-[1.08] tracking-tight text-foreground text-balance">
                Build Your Diet. Track Your Progress. Stay on Target.
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-xl">
                Gym Meals helps you build, customize, and track your nutrition plan around your goals, foods,
                training, and daily routine.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LinkButton href="/login" variant="primary">
                  Get Started
                </LinkButton>
                <LinkButton href="/login" variant="secondary">
                  Log In
                </LinkButton>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Free to start. A flexible nutrition planning and tracking system, not a generic calorie counter.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <HeroProductPreview />
            </div>
          </div>
        </Section>

        {/* Core value proposition */}
        <Section className="border-t border-border">
          <SectionHeading
            eyebrow="Why Gym Meals"
            title="Your nutrition. Your plan. Your control."
            description="Gym Meals is a flexible nutrition planning and tracking system that gives you control over your meals while keeping your nutrition targets visible - not a black-box calorie counter."
          />
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {[
              'Personalized calorie and macro targets',
              'Manual meal planning',
              'Food library',
              'Portion control',
              'Planned vs. eaten tracking',
              'Workout nutrition',
              'Supplement tracking',
              'Nutrition insights',
              'Progress tracking'
            ].map(item => (
              <div key={item} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <CheckIcon size={14} />
                </span>
                <span className="text-sm font-semibold text-foreground">{item}</span>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-surface-elevated text-muted-foreground flex items-center justify-center shrink-0 border border-border">
                <CheckIcon size={14} />
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                Future AI coaching <Badge variant="neutral" className="ml-1 align-middle">Coming soon</Badge>
              </span>
            </div>
          </div>
        </Section>

        {/* Features */}
        <Section id="features" className="border-t border-border" ariaLabel="Features">
          <SectionHeading
            eyebrow="Features"
            title="Everything a real meal plan needs"
            description="Built around how people actually eat and train, not a single daily calorie number."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map(({ Icon, title, description }) => (
              <Card key={title} className="p-5">
                <div className="w-10 h-10 rounded-control bg-primary/15 text-primary flex items-center justify-center mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="font-display font-medium text-lg text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* How it works */}
        <Section id="how-it-works" className="border-t border-border" ariaLabel="How it works">
          <SectionHeading eyebrow="How it works" title="From profile to plan in four steps" />
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <Card className="p-5 h-full">
                  <span className="font-mono tabular-nums text-sm font-bold text-primary">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 font-display font-medium text-lg text-foreground">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        {/* Manual meal planner spotlight */}
        <Section className="border-t border-border">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <Eyebrow>The active product today</Eyebrow>
              <h2 className="mt-4 font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground text-balance">
                Build your plan your way.
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                The manual meal builder is where your plan actually gets made. Add foods, change grams, move things
                between meals, add or remove entire meals, and watch your macros update as you go.
              </p>
              <ul className="mt-6 space-y-3">
                {['Add foods', 'Change grams', 'Move foods between meals', 'Add or remove meals', 'Review macros live', 'Save your own plan'].map(
                  item => (
                    <li key={item} className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <CheckIcon size={12} />
                      </span>
                      {item}
                    </li>
                  )
                )}
              </ul>
              <p className="mt-6 font-display font-medium text-lg text-primary">
                The plan is yours. Change it whenever you want.
              </p>
            </div>

            <Card elevated className="p-5 sm:p-6" aria-hidden="true">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-display font-medium text-lg text-foreground">Lunch</h3>
                <span className="font-mono tabular-nums text-xs font-bold text-muted-foreground">526 kcal</span>
              </div>
              <div className="space-y-2">
                {[
                  { name: 'Grilled Chicken Breast', qty: '180g', kcal: 297, macro: '56g protein' },
                  { name: 'Jasmine Rice', qty: '150g', kcal: 195, macro: '43g carbs' },
                  { name: 'Broccoli', qty: '100g', kcal: 34, macro: '3g protein' }
                ].map(food => (
                  <div
                    key={food.name}
                    className="flex items-center justify-between gap-3 p-3 rounded-control border border-border bg-surface"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{food.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {food.qty} &middot; {food.macro}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-xs text-muted-foreground">{food.kcal} kcal</span>
                      <SwapIcon size={15} className="text-muted-foreground" />
                      <CloseIcon size={15} className="text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled
                aria-hidden="true"
                tabIndex={-1}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[40px] rounded-control border border-dashed border-border text-sm font-semibold text-muted-foreground"
              >
                <PlusIcon size={16} />
                Add food
              </button>
            </Card>
          </div>
        </Section>

        {/* Training + workout nutrition */}
        <Section className="border-t border-border">
          <SectionHeading
            eyebrow="Training"
            title="Nutrition built around training, not just meals"
            description="Gym Meals doesn't treat pre- and post-workout nutrition as ordinary meals - they're kept separate, so your training days look different from your rest days without extra bookkeeping."
          />
          <div className="grid sm:grid-cols-3 gap-4 items-stretch">
            {[
              { label: 'Main Meals', description: 'Breakfast, lunch, dinner - your everyday nutrition foundation.' },
              { label: 'Pre-Workout', description: 'Fuel timed around training, tracked on its own.' },
              { label: 'Post-Workout', description: 'Recovery nutrition, separate from your regular meals.' }
            ].map((block, i) => (
              <div key={block.label} className="flex items-center gap-4">
                <Card className="p-5 flex-1 h-full">
                  <span className="w-9 h-9 rounded-control bg-primary/15 text-primary flex items-center justify-center mb-3">
                    <DumbbellIcon size={18} />
                  </span>
                  <h3 className="font-display font-medium text-base text-foreground">{block.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{block.description}</p>
                </Card>
                {i < 2 && (
                  <span aria-hidden="true" className="hidden sm:flex text-muted-foreground text-xl font-bold">
                    +
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground max-w-2xl">
            You choose how workout nutrition fits into your routine - use it every session, only on training days, or
            not at all.
          </p>
        </Section>

        {/* Supplements */}
        <Section className="border-t border-border">
          <SectionHeading eyebrow="Supplements" title="Supplements, tracked correctly" />
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display font-medium text-lg text-foreground">Whey Protein</h3>
                <Badge variant="protein">Counts toward targets</Badge>
              </div>
              <p className="mt-3 font-mono tabular-nums text-2xl font-bold text-protein">25g</p>
              <p className="text-sm text-muted-foreground">protein per serving</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display font-medium text-lg text-foreground">Creatine</h3>
                <Badge variant="neutral">Doesn&apos;t affect targets</Badge>
              </div>
              <p className="mt-3 font-mono tabular-nums text-2xl font-bold text-foreground">5g</p>
              <p className="text-sm text-muted-foreground">per serving</p>
            </Card>
          </div>
          <p className="mt-6 text-sm text-muted-foreground max-w-2xl">
            Creatine has no meaningful calories or protein, so it&apos;s tracked without ever distorting your daily
            calorie or protein targets.
          </p>
        </Section>

        {/* Insights */}
        <Section id="insights" className="border-t border-border" ariaLabel="Insights">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <Eyebrow>Insights</Eyebrow>
              <h2 className="mt-4 font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground text-balance">
                See your nutrition, not just your calories.
              </h2>
              <ul className="mt-6 space-y-3">
                {['Protein breakdown', 'Animal vs. plant protein', 'Daily nutrition', 'Workout nutrition', 'Progress trends'].map(
                  item => (
                    <li key={item} className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <CheckIcon size={12} />
                      </span>
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            <Card elevated className="p-5 sm:p-6" aria-hidden="true">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Protein Breakdown
              </p>
              <div className="h-3 rounded-full overflow-hidden flex border border-border">
                <div className="bg-protein" style={{ width: '68%' }} />
                <div className="bg-protein/60" style={{ width: '24%' }} />
                <div className="bg-protein/35" style={{ width: '8%' }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-protein" /> Animal 68%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-protein/60" /> Plant 24%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-protein/35" /> Supplement 8%
                </span>
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-6 mb-3">
                Adherence, last 7 days
              </p>
              <div className="flex items-end gap-1.5 h-16">
                {['bg-tier-good', 'bg-tier-excellent', 'bg-tier-excellent', 'bg-tier-partial', 'bg-tier-excellent', 'bg-tier-good', 'bg-tier-excellent'].map(
                  (cls, i) => (
                    <div key={i} className="flex-1 rounded-t-chip bg-surface-elevated border border-border overflow-hidden self-end h-full flex items-end">
                      <div className={`w-full ${cls}`} style={{ height: `${[62, 92, 88, 45, 96, 70, 90][i]}%` }} />
                    </div>
                  )
                )}
              </div>
            </Card>
          </div>
        </Section>

        {/* Progress / future AI */}
        <Section className="border-t border-border">
          <SectionHeading eyebrow="Roadmap" title="Where Gym Meals is headed" />
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
            <Card elevated className="p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="w-9 h-9 rounded-control bg-primary/15 text-primary flex items-center justify-center">
                  <PlusIcon size={18} />
                </span>
                <Badge variant="success">Available now</Badge>
              </div>
              <h3 className="mt-4 font-display font-medium text-lg text-foreground">Manual Meal Planning</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Full control over every food, portion, and meal - the product you can use today.
              </p>
            </Card>
            <Card className="p-5 opacity-70" aria-disabled="true">
              <div className="flex items-center justify-between gap-3">
                <span className="w-9 h-9 rounded-control bg-surface-elevated text-muted-foreground flex items-center justify-center border border-border">
                  <SearchIcon size={18} />
                </span>
                <Badge variant="neutral">Coming soon</Badge>
              </div>
              <h3 className="mt-4 font-display font-medium text-lg text-foreground">AI Meal Planner</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">Not available yet - no early access or preview.</p>
            </Card>
          </div>
          <p className="mt-6 text-sm text-muted-foreground max-w-2xl">
            AI-powered meal planning and progress coaching are coming next, building on the same manual foundation
            you can already use today.
          </p>
        </Section>

        {/* Trust */}
        <Section className="border-t border-border">
          <SectionHeading eyebrow="Built to be trusted" title="Designed around real nutrition tracking" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TRUST_POINTS.map(point => (
              <Card key={point.title} className="p-5">
                <h3 className="font-display font-medium text-base text-foreground">{point.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{point.description}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" className="border-t border-border" ariaLabel="Frequently asked questions">
          <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
          <div className="max-w-2xl space-y-3">
            {FAQ_ITEMS.map(item => (
              <details
                key={item.question}
                className="group rounded-card border border-border bg-surface p-4 sm:p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-control">
                  {item.question}
                  <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                    <PlusIcon size={18} />
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <Section className="border-t border-border">
          <Card elevated className="p-10 sm:p-14 text-center">
            <h2 className="font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground text-balance">
              Build a plan that actually fits your life.
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href="/login" variant="primary">
                Get Started
              </LinkButton>
              <LinkButton href="/login" variant="secondary">
                Log In
              </LinkButton>
            </div>
          </Card>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
                GM
              </div>
              <span className="font-display font-semibold text-lg tracking-tight text-foreground">Gym Meals</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs">
              A flexible nutrition planning and tracking system that keeps your targets visible while you stay in
              control of every meal.
            </p>
          </div>
          <nav aria-label="Footer">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Product</p>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="text-foreground hover:text-primary transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="text-foreground hover:text-primary transition-colors">How It Works</a></li>
              <li><a href="#insights" className="text-foreground hover:text-primary transition-colors">Insights</a></li>
              <li><a href="/login" className="text-foreground hover:text-primary transition-colors">Log In</a></li>
              <li><a href="/login" className="text-foreground hover:text-primary transition-colors">Get Started</a></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Legal</p>
            <ul className="space-y-2 text-sm">
              <li><a href="/privacy" className="text-foreground hover:text-primary transition-colors">Privacy</a></li>
              <li><a href="/terms" className="text-foreground hover:text-primary transition-colors">Terms</a></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Gym Meals. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  )
}
