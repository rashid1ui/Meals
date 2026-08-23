import type { Metadata } from 'next'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Header from '@/components/ui/Header'
import {
  PlusIcon,
  MinusIcon,
  CloseIcon,
  CheckIcon,
  SwapIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SpinnerIcon,
  AlertIcon,
  MenuIcon,
  ClockIcon,
  CalendarIcon,
  ChartIcon,
  CircleIcon,
  HalfCircleIcon,
  MoonIcon,
  SunIcon,
  HomeIcon
} from '@/components/ui/icons'
import CopyChip from './CopyChip'

export const metadata: Metadata = {
  title: 'Design System | Gym Meals',
  description: 'Color, typography, spacing, and component reference for Gym Meals.'
}

const NAV_SECTIONS = [
  { id: 'navigation', label: 'Navigation' },
  { id: 'colors', label: 'Color' },
  { id: 'typography', label: 'Typography' },
  { id: 'spacing', label: 'Spacing & Radius' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'motion', label: 'Motion' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'badges', label: 'Badges' },
  { id: 'cards', label: 'Cards' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'icons', label: 'Icons' },
  { id: 'accessibility', label: 'Accessibility' }
]

type ColorToken = {
  name: string
  cssVar: string
  light: string
  dark: string
  usage: string
  swatch: string
}

const SURFACE_COLORS: ColorToken[] = [
  { name: 'Background', cssVar: '--background', light: '#f6f5f0', dark: '#0e130f', usage: 'Page background', swatch: 'bg-background' },
  { name: 'Surface', cssVar: '--surface', light: '#ffffff', dark: '#171d18', usage: 'Cards, header, panels', swatch: 'bg-surface' },
  { name: 'Surface Elevated', cssVar: '--surface-elevated', light: '#fbfaf6', dark: '#1e2620', usage: 'Menus, modals, hover fills', swatch: 'bg-surface-elevated' },
  { name: 'Border', cssVar: '--border', light: '#dce2d6', dark: '#2c3830', usage: 'Dividers, outlines', swatch: 'bg-border' },
  { name: 'Foreground', cssVar: '--foreground', light: '#16241c', dark: '#edf2ea', usage: 'Primary text', swatch: 'bg-foreground' },
  { name: 'Muted Foreground', cssVar: '--muted-foreground', light: '#57685c', dark: '#9fae9a', usage: 'Secondary text, helper copy', swatch: 'bg-muted-foreground' }
]

const BRAND_COLORS: ColorToken[] = [
  { name: 'Primary', cssVar: '--primary', light: '#00865d', dark: '#2fae7d', usage: 'Headings, links, focus ring, "brand" button fill', swatch: 'bg-primary' },
  { name: 'Primary Strong', cssVar: '--primary-strong', light: '#066b49', dark: '#45e069', usage: 'Primary/brand hover state', swatch: 'bg-primary-strong' },
  { name: 'Primary Foreground', cssVar: '--primary-foreground', light: '#ffffff', dark: '#04160e', usage: 'Text/icons on primary fill', swatch: 'bg-primary-foreground' },
  { name: 'Accent', cssVar: '--accent', light: '#45e069', dark: '#61f085', usage: 'Primary button fill (the lime MealTrack actually uses)', swatch: 'bg-accent' },
  { name: 'Accent Strong', cssVar: '--accent-strong', light: '#33c957', dark: '#45e069', usage: 'Accent hover state', swatch: 'bg-accent-strong' },
  { name: 'Accent Foreground', cssVar: '--accent-foreground', light: '#04331f', dark: '#04160e', usage: 'Text/icons on accent fill', swatch: 'bg-accent-foreground' }
]

const SEMANTIC_COLORS: ColorToken[] = [
  { name: 'Success', cssVar: '--success', light: '#0d9488', dark: '#2dd4c0', usage: 'Positive status, on-target (a teal, kept off brand green)', swatch: 'bg-success' },
  { name: 'Warning', cssVar: '--warning', light: '#b45309', dark: '#e3a23a', usage: 'Caution, partial progress', swatch: 'bg-warning' },
  { name: 'Error', cssVar: '--error', light: '#c0392b', dark: '#f0685a', usage: 'Destructive actions, failures', swatch: 'bg-error' }
]

const MACRO_COLORS: ColorToken[] = [
  { name: 'Protein', cssVar: '--protein', light: '#1b63f6', dark: '#6e9cf9', usage: 'Protein badges, progress bars', swatch: 'bg-protein' },
  { name: 'Carbs', cssVar: '--carbs', light: '#b5590e', dark: '#f2a05c', usage: 'Carb badges - now free to use the old brand orange', swatch: 'bg-carbs' },
  { name: 'Fat', cssVar: '--fat', light: '#8b6b14', dark: '#e7c25b', usage: 'Fat badges, progress bars', swatch: 'bg-fat' },
  { name: 'Calories', cssVar: '--calories', light: '#e8583d', dark: '#ff8a6b', usage: 'Calorie totals - moved off green, which used to collide with brand', swatch: 'bg-calories' }
]

const TIER_COLORS: ColorToken[] = [
  { name: 'Excellent', cssVar: '--tier-excellent', light: '#0d9488', dark: '#2dd4c0', usage: '90%+ adherence day', swatch: 'bg-tier-excellent' },
  { name: 'Good', cssVar: '--tier-good', light: '#3fa796', dark: '#59c2b4', usage: '70-89% adherence day', swatch: 'bg-tier-good' },
  { name: 'Partial', cssVar: '--tier-partial', light: '#b45309', dark: '#e3a23a', usage: '40-69% adherence day', swatch: 'bg-tier-partial' },
  { name: 'Low', cssVar: '--tier-low', light: '#c2660f', dark: '#e08145', usage: '10-39% adherence day', swatch: 'bg-tier-low' },
  { name: 'Very Low', cssVar: '--tier-verylow', light: '#c0392b', dark: '#f0685a', usage: '<10% adherence day', swatch: 'bg-tier-verylow' },
  { name: 'None', cssVar: '--tier-none', light: '#d8ddd2', dark: '#3a453c', usage: 'No data logged (fill/border only)', swatch: 'bg-tier-none' }
]

const RADIUS_TOKENS = [
  { name: 'Chip', cssVar: '--radius-chip', value: '10px', className: 'rounded-chip' },
  { name: 'Control', cssVar: '--radius-control', value: '14px', className: 'rounded-control' },
  { name: 'Card', cssVar: '--radius-card', value: '20px', className: 'rounded-card' },
  { name: 'Panel', cssVar: '--radius-panel', value: '28px', className: 'rounded-panel' },
  { name: 'Pill', cssVar: '--radius-pill', value: '9999px', className: 'rounded-pill' }
]

const SHADOW_TOKENS = [
  { name: 'Subtle', cssVar: '--shadow-subtle', className: 'shadow-[var(--shadow-subtle)]' },
  { name: 'Card', cssVar: '--shadow-card', className: 'shadow-[var(--shadow-card)]' },
  { name: 'Panel', cssVar: '--shadow-panel', className: 'shadow-[var(--shadow-panel)]' },
  { name: 'Modal', cssVar: '--shadow-modal', className: 'shadow-[var(--shadow-modal)]' }
]

const ICONS = [
  { Icon: HomeIcon, name: 'HomeIcon' },
  { Icon: PlusIcon, name: 'PlusIcon' },
  { Icon: MinusIcon, name: 'MinusIcon' },
  { Icon: CloseIcon, name: 'CloseIcon' },
  { Icon: CheckIcon, name: 'CheckIcon' },
  { Icon: SwapIcon, name: 'SwapIcon' },
  { Icon: SearchIcon, name: 'SearchIcon' },
  { Icon: ChevronLeftIcon, name: 'ChevronLeftIcon' },
  { Icon: ChevronDownIcon, name: 'ChevronDownIcon' },
  { Icon: ChevronRightIcon, name: 'ChevronRightIcon' },
  { Icon: SpinnerIcon, name: 'SpinnerIcon' },
  { Icon: AlertIcon, name: 'AlertIcon' },
  { Icon: MenuIcon, name: 'MenuIcon' },
  { Icon: ClockIcon, name: 'ClockIcon' },
  { Icon: CalendarIcon, name: 'CalendarIcon' },
  { Icon: ChartIcon, name: 'ChartIcon' },
  { Icon: CircleIcon, name: 'CircleIcon' },
  { Icon: HalfCircleIcon, name: 'HalfCircleIcon' },
  { Icon: MoonIcon, name: 'MoonIcon' },
  { Icon: SunIcon, name: 'SunIcon' }
]

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-foreground">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">{description}</p>}
    </div>
  )
}

function ColorGroup({ title, tokens }: { title: string; tokens: ColorToken[] }) {
  return (
    <div>
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tokens.map(token => (
          <Card key={token.cssVar} className="p-3">
            <div className={`h-14 rounded-chip border border-border ${token.swatch}`} />
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{token.name}</span>
              <CopyChip label={token.name} value={token.cssVar} mono />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{token.usage}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] font-mono tabular-nums text-muted-foreground">
              <span>Light {token.light}</span>
              <span aria-hidden className="text-border">|</span>
              <span>Dark {token.dark}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function DesignSystemPage() {
  return (
    <main className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-20 bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display font-semibold text-lg sm:text-xl tracking-tight text-foreground truncate">
              Gym Meals Design System
            </p>
            <p className="text-xs text-muted-foreground">MealTrack-derived reskin - mirrored from app/globals.css and components/ui/*</p>
          </div>
          <ThemeToggle />
        </div>
        <nav aria-label="Design system sections" className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 flex gap-2 overflow-x-auto">
          {NAV_SECTIONS.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 inline-flex items-center min-h-[32px] px-3 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-16">
        <section>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-primary/15 text-primary border-primary/30">
            Living reference
          </p>
          <h1 className="mt-3 font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground">
            Color, type, and components for Gym Meals
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
            Palette and shape are derived from mealtrack.com&apos;s live computed styles: deep forest green + lime,
            a single rounded geometric sans, and much larger corner radii. Light is still the default brand
            surface; dark is a full opt-in palette toggled with the switch above (also available from the
            account menu). Every swatch and control on this page renders from the same CSS variables the rest
            of the app uses, so toggling the theme here previews it exactly as it looks everywhere else.
          </p>
        </section>

        <section id="navigation" className="scroll-mt-28">
          <SectionHeading
            title="Navigation"
            description="The real Header component, rendered live with placeholder identity. Home + Insights sit in the true geometric center via a 1fr/auto/1fr grid, independent of how wide the logo or account controls are - resize the window to see it collapse into the mobile menu below 640px."
          />
          <div className="relative rounded-panel border border-border bg-background overflow-hidden py-6 [&>div]:!static">
            <Header userName="Alex Rivera" userEmail="alex@example.com" />
          </div>
        </section>

        <section id="colors" className="scroll-mt-28">
          <SectionHeading
            title="Color"
            description="Semantic tokens only - components never reference raw hex values. Each swatch below resolves live from the current theme; the Light/Dark values are for reference."
          />
          <div className="space-y-8">
            <ColorGroup title="Surfaces & text" tokens={SURFACE_COLORS} />
            <ColorGroup title="Brand" tokens={BRAND_COLORS} />
            <ColorGroup title="Semantic status" tokens={SEMANTIC_COLORS} />
            <ColorGroup title="Macro nutrients" tokens={MACRO_COLORS} />
            <ColorGroup title="Insights adherence tiers" tokens={TIER_COLORS} />
          </div>
        </section>

        <section id="typography" className="scroll-mt-28">
          <SectionHeading
            title="Typography"
            description="One family, Rubik, for both font-display and font-sans - light weight for headings and body, bold for CTAs, matching MealTrack's own type system. JetBrains Mono is kept as a deliberate exception for tabular macro/calorie figures."
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">font-display - Rubik 500</p>
              <p className="mt-1 text-sm text-muted-foreground">Headings, nav brand, hero text</p>
              <p className="font-display font-medium text-4xl mt-4 text-foreground">Gym Meals</p>
              <p className="font-display font-medium text-xl mt-1 text-foreground">Track your macros</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">font-sans - Rubik 400</p>
              <p className="mt-1 text-sm text-muted-foreground">Body copy, labels, UI text</p>
              <p className="text-lg font-semibold mt-4 text-foreground">Body large / semibold</p>
              <p className="text-base mt-2 text-foreground">Body base 16px - the minimum for readable copy.</p>
              <p className="text-sm mt-2 text-muted-foreground">Body small - helper text, captions.</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">font-mono (exception)</p>
              <p className="mt-1 text-sm text-muted-foreground">JetBrains Mono - tabular figures, macro counts</p>
              <p className="font-mono tabular-nums text-3xl mt-4 text-foreground">2,140 kcal</p>
              <p className="font-mono tabular-nums text-lg mt-2 text-protein">168g protein</p>
            </Card>
          </div>
          <div className="mt-4 rounded-card border border-border bg-surface p-4 text-xs text-muted-foreground">
            Body text never drops below <span className="font-mono">14px</span> (helper/caption) or{' '}
            <span className="font-mono">16px</span> (default body), and line-height stays at 1.5+ for paragraphs.
            Kept a monospace face for numerals since tabular alignment is a legibility need specific to a
            nutrition dashboard, not a brand choice MealTrack&apos;s marketing site had to make.
          </div>
        </section>

        <section id="spacing" className="scroll-mt-28">
          <SectionHeading
            title="Spacing & radius"
            description="Radius tokens are defined as custom properties in globals.css and mapped to the Tailwind class already used at each size - swapping component classNames onto the named token is a Phase 2, no-visual-change change."
          />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {RADIUS_TOKENS.map(token => (
              <Card key={token.cssVar} className="p-3 text-center">
                <div className={`h-16 w-full bg-primary/15 border-2 border-primary/40 ${token.className}`} />
                <p className="mt-2 text-sm font-semibold text-foreground">{token.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{token.value}</p>
              </Card>
            ))}
          </div>
          <div className="mt-4 rounded-card border border-border bg-surface p-4 text-xs text-muted-foreground">
            Every interactive control keeps a minimum 44&times;44px tap target regardless of visual density - see{' '}
            <a href="#accessibility" className="text-primary underline underline-offset-2">Accessibility</a>.
          </div>
        </section>

        <section id="elevation" className="scroll-mt-28">
          <SectionHeading
            title="Elevation"
            description="Shadows are mostly retired in this pass - MealTrack conveys depth through a 1px border and surface/background contrast rather than box-shadow. --shadow-modal is the one real shadow kept, since a modal has no surrounding surface to contrast against."
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {SHADOW_TOKENS.map(token => (
              <div key={token.cssVar} className="text-center">
                <div className={`h-20 rounded-card bg-surface-elevated border border-border ${token.className}`} />
                <p className="mt-2 text-sm font-semibold text-foreground">{token.name}</p>
                <CopyChip label={token.name} value={token.cssVar} mono />
              </div>
            ))}
          </div>
        </section>

        <section id="motion" className="scroll-mt-28">
          <SectionHeading
            title="Motion"
            description="Two keyframes cover the app's motion needs: a step-in entrance for menus/panels, and an indeterminate progress bar. Both are disabled under prefers-reduced-motion."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">animate-step-in</p>
              <p className="text-xs text-muted-foreground mt-1">260ms ease-out - fade + rise 8px. Used for menus, modals, toasts.</p>
              <div className="mt-4 h-16 rounded-control border border-border bg-surface-elevated flex items-center justify-center overflow-hidden">
                <div className="animate-step-in rounded-control bg-primary/15 text-primary text-xs font-semibold px-3 py-1.5 border border-primary/30">
                  Panel content
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">animate-indeterminate-bar</p>
              <p className="text-xs text-muted-foreground mt-1">1.6s ease-in-out loop - used while a duration is unknown (sync, upload).</p>
              <div className="mt-4 h-2 rounded-full bg-surface-elevated border border-border overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate-bar" />
              </div>
            </Card>
          </div>
        </section>

        <section id="buttons" className="scroll-mt-28">
          <SectionHeading
            title="Buttons"
            description="Five variants, two sizes, always pill-shaped. “primary” fills with the lime accent - MealTrack's actual CTA fill; “brand” fills with the deep green instead, for a lower-emphasis solid action next to a lime CTA. Both sizes keep a 44px minimum height; sm only trims padding and font size."
          />
          <div className="space-y-4">
            {(['primary', 'brand', 'secondary', 'danger', 'ghost'] as const).map(variant => (
              <div key={variant} className="flex flex-wrap items-center gap-3">
                <span className="w-20 text-xs font-mono text-muted-foreground shrink-0">{variant}</span>
                <Button variant={variant} size="md">Medium</Button>
                <Button variant={variant} size="sm">Small</Button>
                <Button variant={variant} loading>Loading</Button>
                <Button variant={variant} disabled>Disabled</Button>
              </div>
            ))}
          </div>
        </section>

        <section id="badges" className="scroll-mt-28">
          <SectionHeading title="Badges" description="Uppercase, bold, pill-shaped status labels. Semantic and macro variants use a 15% fill with a 30% border of the same hue." />
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="protein">Protein</Badge>
            <Badge variant="carbs">Carbs</Badge>
            <Badge variant="fat">Fat</Badge>
            <Badge variant="calories">Calories</Badge>
          </div>
        </section>

        <section id="cards" className="scroll-mt-28">
          <SectionHeading title="Cards" description="Default cards sit on background; elevated cards sit inside another surface (e.g. inside a modal)." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">Default card</p>
              <p className="text-xs text-muted-foreground mt-1">bg-surface, for content directly on the page background.</p>
            </Card>
            <Card elevated className="p-5">
              <p className="text-sm font-semibold text-foreground">Elevated card</p>
              <p className="text-xs text-muted-foreground mt-1">bg-surface-elevated, for content nested inside a surface.</p>
            </Card>
          </div>
        </section>

        <section id="inputs" className="scroll-mt-28">
          <SectionHeading title="Inputs" description="Labels are always visible (never placeholder-only); helper text and errors share one accessible description slot." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Meal name" placeholder="e.g. Breakfast" />
            <Input label="Grams" numeric trailing="g" helperText="Portion size in grams" />
            <Input label="Calories" numeric trailing="kcal" defaultValue="450" error="Must be greater than 0" />
          </div>
        </section>

        <section id="icons" className="scroll-mt-28">
          <SectionHeading title="Icons" description="Stroke-based SVGs, 24x24 viewBox, currentColor stroke. Decorative by default (aria-hidden) - the interactive wrapper carries the accessible name." />
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {ICONS.map(({ Icon, name }) => (
              <div key={name} className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-3">
                <Icon size={22} className="text-foreground" />
                <span className="text-[11px] font-mono text-muted-foreground text-center break-all">{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="accessibility" className="scroll-mt-28">
          <SectionHeading title="Accessibility" description="Baseline rules every component in this app follows." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">Touch targets</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Every interactive control (buttons, inputs, nav items, the theme toggle) keeps a 44&times;44px
                minimum hit area, independent of visual size.
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">Focus rings</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                <span className="font-mono">focus-visible:ring-2 focus-visible:ring-primary</span> on every
                focusable element - never removed, only restyled.
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">Contrast</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Status/macro colors used as text (badges, danger button) are the deepened, AA-safe (4.5:1+) variant
                in light theme, since light surfaces afford less room than dark ones.
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold text-foreground">Reduced motion</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                <span className="font-mono">prefers-reduced-motion: reduce</span> collapses every animation and
                transition to near-zero duration globally.
              </p>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}
