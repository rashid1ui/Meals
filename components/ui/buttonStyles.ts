// Shared visual system for Button (renders <button>) and LinkButton (renders
// next/link's <a>) - extracted so the two never visually drift apart. A CTA
// that navigates (Get Started, Log In) needs real link semantics, not a
// <button onClick={navigate}>, but it must look pixel-identical to the
// button it stands next to.

export type ButtonVariant = 'primary' | 'brand' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm'

// "primary" fills with --accent (lime) - MealTrack's actual button fill.
// "brand" fills with --primary (deep green) instead, for a lower-emphasis
// solid action that shouldn't compete with a lime CTA on the same screen.
export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-foreground hover:bg-accent-strong',
  brand: 'bg-primary text-primary-foreground hover:bg-primary-strong',
  secondary: 'bg-surface border border-border text-foreground hover:bg-surface-elevated',
  danger: 'bg-transparent border border-error text-error hover:bg-error/10',
  ghost: 'bg-transparent text-muted-foreground hover:text-foreground'
}

// Both sizes meet the 44px minimum touch target - "sm" only trims padding
// and font-size for visual density, never the tappable height.
export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-[44px] px-5 text-[15px]',
  sm: 'min-h-[44px] px-3.5 text-sm'
}

export function buttonBaseClassName(variant: ButtonVariant, size: ButtonSize, className = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-pill font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${BUTTON_VARIANT_CLASSES[variant]} ${BUTTON_SIZE_CLASSES[size]} ${className}`
}
