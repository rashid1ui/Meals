type Props = {
  // Completion percentage. May exceed 100 (overeaten) - the displayed number
  // is the real rounded value, only the drawn arc is clamped at a full turn.
  value: number
  // Accessible name for the progressbar, e.g. "Breakfast - 40% of its
  // calories eaten". The centered "%" glyph is decorative on top of this.
  label: string
  size?: number
  strokeWidth?: number
  className?: string
}

// A compact circular completion indicator, drawn as an SVG donut on the
// existing token palette (--color-border track, --color-primary arc). Purely
// presentational sibling of TrackingStatusIcon: it never owns interaction,
// and it never conveys state by arc alone - the rounded percentage is always
// rendered in the centre as text, and the caller pairs it with a visible
// text label ("complete"). Transitions on the arc are killed by the global
// prefers-reduced-motion rule in globals.css.
export default function ProgressRing({
  value,
  label,
  size = 64,
  strokeWidth = 6,
  className = ''
}: Props) {
  const rounded = Math.round(value)
  const arcPct = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - arcPct / 100)
  const complete = rounded >= 100

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={complete ? 'var(--color-success)' : 'var(--color-primary)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute font-mono tabular-nums font-bold text-foreground"
        style={{ fontSize: Math.max(11, Math.round(size * 0.24)) }}
      >
        {rounded}%
      </span>
    </span>
  )
}
