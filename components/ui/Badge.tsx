import type { HTMLAttributes } from 'react'

type BadgeVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'error'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'calories'

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-elevated text-muted-foreground border-border',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
  protein: 'bg-protein/15 text-protein border-protein/30',
  carbs: 'bg-carbs/15 text-carbs border-carbs/30',
  fat: 'bg-fat/15 text-fat border-fat/30',
  calories: 'bg-calories/15 text-calories border-calories/30'
}

export default function Badge({ variant = 'neutral', className = '', children, ...rest }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
