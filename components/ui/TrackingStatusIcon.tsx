import { CheckIcon } from './icons'

export type TrackingVisualStatus = 'none' | 'partial' | 'complete'

type Props = {
  status: TrackingVisualStatus
  size?: number
}

// Renders the tri-state food/meal completion indicator as an actual
// checkbox-shaped glyph - an empty ring when not eaten, a tinted ring with a
// center dot when partially eaten, and a solid filled circle with a
// checkmark when fully eaten - instead of a bare stroke-only icon that reads
// as decorative rather than interactive. Purely visual and inert
// (aria-hidden): the <button> wrapping this always owns the click handler,
// role="checkbox", aria-checked, and aria-label - see FoodRow.tsx and
// MealCard.tsx, both of which render this identically so "empty circle" vs
// "checkmark" means the same thing everywhere in the app.
export default function TrackingStatusIcon({ status, size = 22 }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center shrink-0 rounded-full border-2 transition-colors ${
        status === 'complete'
          ? 'bg-success border-success'
          : status === 'partial'
            ? 'bg-warning/20 border-warning'
            : 'bg-transparent border-muted-foreground'
      }`}
      style={{ width: size, height: size }}
    >
      {status === 'complete' && (
        <CheckIcon size={Math.round(size * 0.62)} strokeWidth={3} className="text-primary-foreground" />
      )}
      {status === 'partial' && (
        <span className="block rounded-full bg-warning" style={{ width: Math.round(size * 0.4), height: Math.round(size * 0.4) }} />
      )}
    </span>
  )
}
