import type { ComponentProps } from 'react'
import Link from 'next/link'
import { buttonBaseClassName, type ButtonVariant, type ButtonSize } from './buttonStyles'

// Button-styled navigation, for CTAs that go to a real route (Get Started,
// Log In) rather than perform an in-page action. Renders next/link's <a> -
// a <button onClick={router.push(...)}> would fail "open in new tab",
// right-click "copy link", and screen-reader link semantics that a real
// anchor gets for free. Shares Button's exact classes via buttonStyles.ts so
// the two are visually indistinguishable next to each other.
type Props = ComponentProps<typeof Link> & {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

export default function LinkButton({ variant = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  return (
    <Link className={buttonBaseClassName(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}
