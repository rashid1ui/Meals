// Public marketing landing page, rendered by app/page.tsx for logged-out
// visitors only (an authenticated user hitting "/" still gets the existing
// redirect to /dashboard or /onboarding, unchanged). A Server Component -
// the only client-side piece on the whole page is LandingNav's mobile menu
// toggle. Every product "screenshot" below is a static recreation built
// from the same primitives (Card, Badge, design tokens) the real dashboard
// uses, not an imported dashboard component (those are wired to live
// Supabase data/callbacks and can't render for an anonymous visitor).
// Food photography (images.ts) is real, individually-verified,
// Unsplash-licensed photography.
//
// This pass is an Apple-inspired restyle: larger type, much more
// whitespace, fewer/bigger editorial sections, a cinematic photo hero, and
// CSS-only reveal motion (see .reveal / .hero-rise in globals.css). The
// green brand tokens, component library, routes, and copy claims are
// unchanged - manual planning is "available now", AI is "coming soon", and
// nothing implies pre/post-workout meals replace main meals or that photos
// measure body composition.
import type { ReactNode } from 'react'
import Image from 'next/image'
import Badge from '@/components/ui/Badge'
import LinkButton from '@/components/ui/LinkButton'
import LandingNav from './LandingNav'
import {
  HERO_IMAGE,
  MEAL_PLANNER_IMAGE,
  FOOD_LIBRARY_IMAGE,
  WORKOUT_NUTRITION_IMAGE,
  SUPPLEMENTS_IMAGE
} from './images'
import {
  PlusIcon,
  SwapIcon,
  CloseIcon,
  CheckIcon,
  DumbbellIcon,
  ClockIcon,
  ChartIcon,
  TrendingUpIcon,
  TargetIcon,
  SearchIcon,
  type IconProps
} from '@/components/ui/icons'

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Section({
  id,
  children,
  className = '',
  ariaLabel,
  width = 'max-w-6xl'
}: {
  id?: string
  children: ReactNode
  className?: string
  ariaLabel?: string
  width?: string
}) {
  return (
    <section id={id} aria-label={ariaLabel} className={`scroll-mt-28 py-20 sm:py-28 lg:py-32 ${className}`}>
      <div className={`${width} mx-auto px-5 sm:px-8`}>{children}</div>
    </section>
  )
}

function Eyebrow({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'light' }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.16em] ${
        tone === 'light' ? 'text-white/75' : 'text-primary'
      }`}
    >
      {children}
    </p>
  )
}

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'left',
  className = ''
}: {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto text-center max-w-3xl' : 'max-w-2xl'} ${className}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-4 font-display font-medium text-[2rem] leading-[1.1] sm:text-4xl lg:text-5xl tracking-[-0.02em] text-foreground text-balance">
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-5 text-lg leading-relaxed text-muted-foreground text-pretty ${
            align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-xl'
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  )
}

function CheckList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-3.5 ${className}`}>
      {items.map(item => (
        <li key={item} className="flex items-start gap-3 text-[15px] font-semibold text-foreground">
          <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <CheckIcon size={12} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Static product recreations (decorative - aria-hidden)
// ---------------------------------------------------------------------------

// Meal builder - mirrors the real manual planner's meal/food-row structure.
function MealBuilderMock() {
  const foods = [
    { name: 'Grilled Chicken Breast', qty: '180 g', kcal: 297, macro: '56 g protein' },
    { name: 'Jasmine Rice', qty: '150 g', kcal: 195, macro: '43 g carbs' },
    { name: 'Broccoli', qty: '100 g', kcal: 34, macro: '3 g protein' },
    { name: 'Olive Oil', qty: '10 g', kcal: 88, macro: '10 g fat' }
  ]
  return (
    <div className="relative" aria-hidden="true">
      {/* soft brand glow behind the panel for depth (inset kept < mobile
          gutter so it never causes horizontal overflow) */}
      <div className="absolute -inset-3 sm:-inset-6 -z-10 rounded-[2.5rem] bg-primary/10 blur-3xl" />

      <div className="relative rounded-panel border border-border bg-surface shadow-[var(--shadow-modal)] overflow-hidden">
        <div className="relative aspect-[16/10]">
          <Image
            src={MEAL_PLANNER_IMAGE.src}
            alt=""
            fill
            loading="lazy"
            sizes="(min-width: 1024px) 46vw, 92vw"
            className="object-cover"
          />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display font-medium text-lg text-foreground">Lunch</h3>
            <span className="font-mono tabular-nums text-xs font-bold text-muted-foreground">614 kcal</span>
          </div>
          <div className="mt-4 space-y-2">
            {foods.map(food => (
              <div
                key={food.name}
                className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface-elevated px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {food.qty} &middot; {food.macro}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                  <span className="font-mono tabular-nums text-xs">{food.kcal}</span>
                  <SwapIcon size={15} />
                  <CloseIcon size={15} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-pill border border-dashed border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground">
            <PlusIcon size={15} />
            Add food
          </div>
        </div>
      </div>

      {/* floating macro-total chip */}
      <div className="absolute -bottom-6 -right-2 sm:-right-6 w-44 rounded-card border border-border bg-surface shadow-[var(--shadow-modal)] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Day total</p>
        <p className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-calories">1,980</p>
        <div className="mt-2 flex gap-3 text-[11px] font-semibold">
          <span className="text-protein">P 172</span>
          <span className="text-carbs">C 190</span>
          <span className="text-fat">F 58</span>
        </div>
      </div>
    </div>
  )
}

// Nutrition targets - big calorie readout + three macro rings.
function Ring({
  label,
  value,
  target,
  unit,
  pct,
  colorVar
}: {
  label: string
  value: number
  target: number
  unit: string
  pct: number
  colorVar: string
}) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={colorVar}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * pct) / 100}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono tabular-nums text-sm font-bold text-foreground">
          {pct}%
        </span>
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-foreground whitespace-nowrap">
        {value}
        <span className="text-muted-foreground font-normal"> / {target}{unit}</span>
      </p>
    </div>
  )
}

function TargetsPanel() {
  return (
    <div
      className="rounded-panel border border-border bg-surface shadow-[var(--shadow-panel)] p-6 sm:p-9"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Daily target</span>
        <Badge variant="success">On track</Badge>
      </div>
      <div className="mt-4 flex items-baseline gap-2 flex-wrap">
        <span className="font-mono tabular-nums text-5xl sm:text-6xl font-bold text-calories">2,400</span>
        <span className="text-muted-foreground text-lg">kcal / day</span>
      </div>
      <div className="mt-4 h-2.5 rounded-full bg-surface-elevated border border-border overflow-hidden">
        <div className="h-full rounded-full bg-calories" style={{ width: '77%' }} />
      </div>
      <div className="mt-8 grid grid-cols-3 gap-4">
        <Ring label="Protein" value={142} target={180} unit="g" pct={79} colorVar="var(--protein)" />
        <Ring label="Carbs" value={165} target={230} unit="g" pct={72} colorVar="var(--carbs)" />
        <Ring label="Fat" value={48} target={70} unit="g" pct={69} colorVar="var(--fat)" />
      </div>
    </div>
  )
}

// Insights - analytics panel with protein sourcing + a 7-day calorie chart.
function InsightsPanel() {
  const days = [
    { label: 'M', pct: 62, cls: 'bg-tier-good' },
    { label: 'T', pct: 94, cls: 'bg-tier-excellent' },
    { label: 'W', pct: 88, cls: 'bg-tier-excellent' },
    { label: 'T', pct: 45, cls: 'bg-tier-partial' },
    { label: 'F', pct: 96, cls: 'bg-tier-excellent' },
    { label: 'S', pct: 71, cls: 'bg-tier-good' },
    { label: 'S', pct: 90, cls: 'bg-tier-excellent' }
  ]
  return (
    <div
      className="rounded-panel border border-border bg-surface shadow-[var(--shadow-panel)] p-6 sm:p-9 space-y-8"
      aria-hidden="true"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Protein by source</p>
        <div className="mt-3 h-3.5 rounded-full overflow-hidden flex border border-border">
          <div className="bg-protein" style={{ width: '64%' }} />
          <div className="bg-protein/55" style={{ width: '28%' }} />
          <div className="bg-protein/30" style={{ width: '8%' }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-protein" /> Animal 64%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-protein/55" /> Plant 28%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-protein/30" /> Supplement 8%
          </span>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Calorie adherence, last 7 days
        </p>
        <div className="mt-4 flex items-end gap-2">
          {days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className="w-full h-28 flex items-end rounded-t-chip bg-surface-elevated border border-border overflow-hidden">
                <div className={`w-full ${d.cls}`} style={{ height: `${d.pct}%` }} />
              </div>
              <span className="mt-2 text-[10px] font-semibold text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const HERO_SUPPORT =
  'Gym Meals gives you the tools to build, customize, and track a nutrition plan that fits your goals, food preferences, training, and lifestyle.'

const STEPS = [
  {
    title: 'Tell us about yourself',
    description: 'Age, weight, height, activity level, and goal - the same profile the rest of the app runs on.'
  },
  {
    title: 'Get your nutrition targets',
    description: 'Calorie and macro targets are calculated from that profile - no separate spreadsheet or app.'
  },
  {
    title: 'Build your meal plan',
    description: 'Pick real foods and real portions, organized into the meals your day actually looks like.'
  },
  {
    title: 'Track, adjust, improve',
    description: 'Log what you actually eat, compare it to plan, and change anything whenever you want.'
  }
]

const CAPABILITIES: { Icon: (props: IconProps) => ReactNode; title: string; description: string }[] = [
  { Icon: PlusIcon, title: 'Manual meal builder', description: 'Add foods, set portions, and arrange meals exactly how you eat.' },
  { Icon: TargetIcon, title: 'Personalized targets', description: 'Calories, protein, carbs, and fat from your profile and goal.' },
  { Icon: SearchIcon, title: 'Full food library', description: 'Protein, carb, fat, vegetable, fruit, and supplement sources.' },
  { Icon: DumbbellIcon, title: 'Workout nutrition', description: 'Pre- and post-workout nutrition kept separate from main meals.' },
  { Icon: ChartIcon, title: 'Nutrition insights', description: 'Animal vs. plant protein, macro trends, and adherence at a glance.' },
  { Icon: TrendingUpIcon, title: 'Progress tracking', description: 'Weight, measurements, and progress photos, built for check-ins ahead.' }
]

const FAQ_ITEMS = [
  {
    question: 'Is the meal plan built by AI?',
    answer:
      "Not yet. Today's meal plan is fully manual - you choose every food and portion yourself. AI-assisted planning is on the roadmap, not a current feature."
  },
  {
    question: 'Can I change my plan after I create it?',
    answer:
      'Yes. Add, remove, or move foods and meals, and adjust portions any time - nothing is locked once your plan is saved.'
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
  { question: 'Is my data private?', answer: 'Your nutrition data is tied to your own account and only accessible to you.' }
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
        {/* ---- HERO -------------------------------------------------------- */}
        <section className="relative overflow-hidden" aria-label="Introduction">
          <div className="absolute inset-0">
            <Image
              src={HERO_IMAGE.src}
              alt={HERO_IMAGE.alt}
              fill
              preload
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-black/35" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" />
          </div>

          <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-32 sm:py-44 lg:py-52">
            <div className="max-w-3xl">
              <div className="hero-rise">
                <Eyebrow tone="light">Personalized nutrition, your way</Eyebrow>
              </div>
              <h1 className="hero-rise hero-rise-delay-1 mt-6 font-display font-medium text-[2rem] leading-[1.08] sm:text-6xl sm:leading-[1.05] lg:text-7xl tracking-[-0.03em] text-white text-balance">
                <span className="block">Build Your Diet.</span>
                <span className="block">Track Your Progress.</span>
                <span className="block">Stay on Target.</span>
              </h1>
              <p className="hero-rise hero-rise-delay-2 mt-7 text-lg sm:text-xl leading-relaxed text-white/85 max-w-xl text-pretty">
                {HERO_SUPPORT}
              </p>
              <div className="hero-rise hero-rise-delay-3 mt-9 flex flex-wrap items-center gap-3">
                <LinkButton
                  href="/login"
                  variant="primary"
                  className="text-base px-7 min-h-[52px] transition-all hover:-translate-y-0.5"
                >
                  Get Started
                </LinkButton>
                <LinkButton
                  href="/login"
                  variant="secondary"
                  className="text-base px-7 min-h-[52px] bg-white/10 border-white/30 text-white backdrop-blur-sm hover:bg-white/20 transition-all hover:-translate-y-0.5"
                >
                  Log In
                </LinkButton>
              </div>
              <p className="hero-rise hero-rise-delay-3 mt-5 text-sm text-white/65">
                Free to start. A flexible nutrition planning and tracking system, not a generic calorie counter.
              </p>
            </div>
          </div>
        </section>

        {/* ---- STATEMENT ------------------------------------------------- */}
        <Section width="max-w-4xl">
          <div className="reveal text-center">
            <h2 className="font-display font-medium text-3xl sm:text-4xl lg:text-5xl tracking-[-0.02em] text-foreground text-balance">
              Your diet should fit your life &mdash; not the other way around.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto text-pretty">
              Gym Meals is a planning and tracking system you actually control. Real foods, real portions, and your
              targets always in view.
            </p>
          </div>
        </Section>

        {/* ---- BUILD YOUR PLAN / MEAL BUILDER (features anchor) --------- */}
        <Section id="features" className="bg-surface border-y border-border" ariaLabel="Meal builder">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div className="reveal">
              <Eyebrow>Build your plan</Eyebrow>
              <h2 className="mt-4 font-display font-medium text-[2rem] leading-[1.1] sm:text-4xl lg:text-5xl tracking-[-0.02em] text-foreground text-balance">
                Your plan. Your rules.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground max-w-xl text-pretty">
                The manual meal builder is where your plan actually gets made. Build meals exactly how you want them and
                watch your macros update as you go.
              </p>
              <CheckList
                className="mt-8"
                items={[
                  'Add foods',
                  'Adjust portions',
                  'Move foods between meals',
                  'Add or remove meals',
                  'Track macro totals live',
                  'Save your own plan'
                ]}
              />
              <p className="mt-8 font-display font-medium text-lg text-primary">
                Nothing is locked in. Change it whenever you want.
              </p>
            </div>
            <div className="reveal lg:pr-6">
              <MealBuilderMock />
            </div>
          </div>
        </Section>

        {/* ---- NUTRITION TARGETS --------------------------------------- */}
        <Section ariaLabel="Nutrition targets">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div className="reveal order-2 lg:order-1">
              <TargetsPanel />
            </div>
            <div className="reveal order-1 lg:order-2">
              <SectionHeading
                eyebrow="Nutrition targets"
                title="Know exactly what your body needs."
                lead="Your calorie and macro targets are calculated from the profile and goal you set - then every meal you build is measured against them."
              />
              <CheckList
                className="mt-8"
                items={[
                  'Calorie target for your goal',
                  'Protein, carbs, and fat split',
                  'Planned vs. eaten, side by side',
                  'Transparent math you can see'
                ]}
              />
            </div>
          </div>
        </Section>

        {/* ---- FULL-BLEED FOOD (rhythm break) ------------------------- */}
        <section className="relative h-[60vh] min-h-[420px] overflow-hidden" aria-label="Whole foods">
          <Image
            src={FOOD_LIBRARY_IMAGE.src}
            alt={FOOD_LIBRARY_IMAGE.alt}
            fill
            loading="lazy"
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/40" />
          <div className="relative h-full max-w-6xl mx-auto px-5 sm:px-8 flex items-end pb-14 sm:pb-20">
            <div className="reveal max-w-xl">
              <h2 className="font-display font-medium text-3xl sm:text-4xl lg:text-5xl tracking-[-0.02em] text-white text-balance">
                Real food. Real portions. No guesswork.
              </h2>
              <p className="mt-4 text-lg text-white/80 text-pretty">
                Chicken, eggs, oats, rice, vegetables, fruit, healthy fats, and protein shakes &mdash; planned to the
                gram.
              </p>
            </div>
          </div>
        </section>

        {/* ---- HOW IT WORKS ----------------------------------------- */}
        <Section id="how-it-works" className="bg-surface border-y border-border" ariaLabel="How it works">
          <div className="reveal">
            <SectionHeading eyebrow="How it works" title="From profile to plan in four steps." align="center" />
          </div>
          <ol className="reveal mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <span className="font-mono tabular-nums text-3xl font-bold text-primary/30">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-display font-medium text-lg text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ---- CAPABILITIES (quiet overview) ----------------------- */}
        <Section ariaLabel="Capabilities">
          <div className="reveal">
            <SectionHeading
              eyebrow="Everything in one place"
              title="Built around how people actually eat and train."
              align="center"
            />
          </div>
          <div className="reveal mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {CAPABILITIES.map(({ Icon, title, description }) => (
              <div key={title}>
                <span className="w-11 h-11 rounded-control bg-primary/12 text-primary flex items-center justify-center">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 font-display font-medium text-lg text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- WORKOUT NUTRITION ----------------------------------- */}
        <Section className="bg-surface border-y border-border" ariaLabel="Workout nutrition">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div className="reveal">
              <SectionHeading
                eyebrow="Training days"
                title="Nutrition built around your training."
                lead="Pre- and post-workout nutrition sit alongside your main meals, tracked separately - so training days look different from rest days without extra bookkeeping."
              />
              <p className="mt-6 text-sm text-muted-foreground max-w-lg">
                Pre- and post-workout nutrition are in addition to your main meals, not a replacement for them. Use them
                every session, only on training days, or not at all.
              </p>
            </div>
            <div className="reveal relative aspect-[4/3] rounded-panel overflow-hidden border border-border shadow-[var(--shadow-panel)]">
              <Image
                src={WORKOUT_NUTRITION_IMAGE.src}
                alt={WORKOUT_NUTRITION_IMAGE.alt}
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 46vw, 92vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="reveal mt-14 grid sm:grid-cols-3 gap-4">
            {[
              { Icon: ClockIcon, label: 'Pre-workout', description: 'Fuel timed before training, tracked on its own.' },
              { Icon: DumbbellIcon, label: 'Main meals', description: 'Breakfast, lunch, dinner - your everyday foundation.' },
              { Icon: TrendingUpIcon, label: 'Post-workout', description: 'Recovery nutrition, separate from regular meals.' }
            ].map(({ Icon, label, description }, i) => (
              <div key={label} className="relative flex items-center gap-4">
                <div className="flex-1 rounded-card border border-border bg-background p-5 h-full transition-all hover:-translate-y-1">
                  <span className="w-9 h-9 rounded-control bg-primary/12 text-primary flex items-center justify-center">
                    <Icon size={18} />
                  </span>
                  <h3 className="mt-3 font-display font-medium text-base text-foreground">{label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                {i < 2 && (
                  <span
                    aria-hidden="true"
                    className="hidden sm:block absolute -right-3 text-muted-foreground text-lg font-bold"
                  >
                    +
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ---- SUPPLEMENTS ---------------------------------------- */}
        <Section ariaLabel="Supplements">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div className="reveal relative aspect-[4/3] rounded-panel overflow-hidden border border-border shadow-[var(--shadow-panel)] order-2 lg:order-1">
              <Image
                src={SUPPLEMENTS_IMAGE.src}
                alt={SUPPLEMENTS_IMAGE.alt}
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 46vw, 92vw"
                className="object-cover"
              />
            </div>
            <div className="reveal order-1 lg:order-2">
              <SectionHeading
                eyebrow="Supplements"
                title="Supplements, counted correctly."
                lead="Each supplement is tracked with the macro behavior that matches it - so your daily totals stay honest."
              />
              <div className="mt-8 grid sm:grid-cols-3 gap-4">
                <div className="rounded-card border border-border bg-surface p-5">
                  <h3 className="font-display font-medium text-base text-foreground">Whey</h3>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-protein">25 g</p>
                  <p className="text-xs text-muted-foreground">protein / serving</p>
                </div>
                <div className="rounded-card border border-border bg-surface p-5">
                  <h3 className="font-display font-medium text-base text-foreground">Creatine</h3>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-foreground">5 g</p>
                  <p className="text-xs text-muted-foreground">/ serving</p>
                </div>
                <div className="rounded-card border border-border bg-surface p-5">
                  <h3 className="font-display font-medium text-base text-foreground">Other</h3>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-foreground">&mdash;</p>
                  <p className="text-xs text-muted-foreground">macros as listed</p>
                </div>
              </div>
              <p className="mt-6 text-sm text-muted-foreground max-w-lg">
                Creatine has no meaningful calories or protein, so it&apos;s tracked without ever distorting your daily
                targets.
              </p>
            </div>
          </div>
        </Section>

        {/* ---- INSIGHTS ---------------------------------------- */}
        <Section id="insights" className="bg-surface border-y border-border" ariaLabel="Insights">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div className="reveal">
              <SectionHeading
                eyebrow="Insights"
                title="See your nutrition, not just a number."
                lead="Gym Meals turns what you log into a clearer picture - protein sourcing, macro trends, calories, and how closely you stuck to plan."
              />
              <CheckList
                className="mt-8"
                items={[
                  'Protein breakdown',
                  'Animal vs. plant protein',
                  'Daily calories and macros',
                  'Workout nutrition',
                  'Adherence trends'
                ]}
              />
            </div>
            <div className="reveal">
              <InsightsPanel />
            </div>
          </div>
        </Section>

        {/* ---- PROGRESS ---------------------------------------- */}
        <Section ariaLabel="Progress tracking">
          <div className="reveal">
            <SectionHeading
              eyebrow="Progress"
              title="Progress you can actually see."
              lead="Track the same numbers over weeks and months, so a plan that's working - or one that needs adjusting - is obvious."
              align="center"
            />
          </div>
          <div className="reveal mt-14 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { week: 'Week 1', note: 'Weight and measurements logged' },
              { week: 'Week 2', note: 'First adherence trend' },
              { week: 'Week 4', note: 'Measurements re-checked' },
              { week: 'Week 8', note: 'Progress photos compared' }
            ].map((s, i) => (
              <div key={s.week} className="relative rounded-card border border-border bg-surface p-5">
                <span className="font-mono tabular-nums text-xs font-bold text-primary">{s.week}</span>
                <p className="mt-2 text-sm text-muted-foreground text-balance">{s.note}</p>
                {i < 3 && (
                  <span
                    aria-hidden="true"
                    className="hidden sm:block absolute top-1/2 -right-3 -translate-y-1/2 text-muted-foreground"
                  >
                    &rarr;
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="reveal mt-8 text-sm text-muted-foreground max-w-2xl mx-auto text-center">
            Track weight, body measurements, nutrition adherence, and progress photos. Structured check-ins are on the
            roadmap. Progress photos are for your own visual comparison &mdash; Gym Meals doesn&apos;t estimate body-fat
            percentage from them.
          </p>
        </Section>

        {/* ---- AI ROADMAP ------------------------------------- */}
        <Section className="bg-surface border-y border-border" ariaLabel="Roadmap">
          <div className="reveal rounded-panel border border-border bg-gradient-to-br from-primary/8 via-surface to-surface p-8 sm:p-14">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <Eyebrow>Roadmap</Eyebrow>
                <Badge variant="neutral">Coming soon</Badge>
              </div>
              <h2 className="mt-4 font-display font-medium text-[2rem] leading-[1.1] sm:text-4xl lg:text-5xl tracking-[-0.02em] text-foreground text-balance">
                Your future nutrition coach.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
                Future versions of Gym Meals may add AI-assisted meal planning, progress analysis, and personalized
                recommendations &mdash; built on the same manual foundation you can use today.
              </p>
              <p className="mt-5 text-sm font-semibold text-muted-foreground">
                None of this is available yet. There is no preview and no early access &mdash; today&apos;s planning is
                fully manual.
              </p>
            </div>
          </div>
        </Section>

        {/* ---- FAQ ------------------------------------------- */}
        <Section id="faq" ariaLabel="Frequently asked questions">
          <div className="reveal">
            <SectionHeading eyebrow="FAQ" title="Frequently asked questions." align="center" />
          </div>
          <div className="reveal mt-12 max-w-2xl mx-auto space-y-3">
            {FAQ_ITEMS.map(item => (
              <details
                key={item.question}
                className="group rounded-card border border-border bg-surface p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-control">
                  {item.question}
                  <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                    <PlusIcon size={18} />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* ---- FINAL CTA ----------------------------------- */}
        <Section className="bg-surface border-t border-border" ariaLabel="Get started">
          <div className="reveal rounded-panel border border-border bg-gradient-to-b from-surface to-primary/8 p-12 sm:p-20 text-center">
            <h2 className="font-display font-medium text-3xl sm:text-4xl lg:text-5xl tracking-[-0.02em] text-foreground text-balance">
              Build a plan that actually fits your life.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto text-pretty">
              Free to start. Manual meal planning, personalized targets, and nutrition insights.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <LinkButton
                href="/login"
                variant="primary"
                className="text-base px-7 min-h-[52px] transition-all hover:-translate-y-0.5"
              >
                Get Started
              </LinkButton>
              <LinkButton
                href="/login"
                variant="secondary"
                className="text-base px-7 min-h-[52px] transition-all hover:-translate-y-0.5"
              >
                Log In
              </LinkButton>
            </div>
          </div>
        </Section>
      </main>

      <footer className="bg-background border-t border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 grid sm:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
                GM
              </div>
              <span className="font-display font-semibold text-lg tracking-tight text-foreground">Gym Meals</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs">
              A flexible nutrition planning and tracking system that keeps your targets visible while you stay in control
              of every meal.
            </p>
          </div>
          <nav aria-label="Footer">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Product</p>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="text-foreground hover:text-primary transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="text-foreground hover:text-primary transition-colors">How It Works</a></li>
              <li><a href="#insights" className="text-foreground hover:text-primary transition-colors">Insights</a></li>
              <li><a href="#faq" className="text-foreground hover:text-primary transition-colors">FAQ</a></li>
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
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Gym Meals. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  )
}
