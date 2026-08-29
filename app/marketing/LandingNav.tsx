'use client'

// Public marketing nav for the logged-out landing page - visually the same
// floating pill language as components/ui/Header.tsx (the authenticated
// nav), but a separate component: the content (Features/How It
// Works/Insights/FAQ + Log In/Get Started) and the "no user identity yet"
// state are fundamentally different from Header's avatar/settings/sign-out,
// so sharing one component would mean threading optional props through a
// pile of conditionals rather than two nav bars that are each simple on
// their own.
//
// The mobile dropdown is a SIBLING of <nav>, not a child: <nav> carries a
// `backdrop-blur` filter, and an absolutely-positioned popover that spills
// outside a backdrop-filtered ancestor composites unreliably (it can render
// semi-transparent). Keeping the menu in the plain `relative` wrapper
// instead avoids that entirely.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import LinkButton from '@/components/ui/LinkButton'
import { MenuIcon, CloseIcon } from '@/components/ui/icons'

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#insights', label: 'Insights' },
  { href: '#faq', label: 'FAQ' }
]

export default function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="sticky top-0 z-40 px-3 sm:px-4 pt-3 sm:pt-4">
      <div className="relative max-w-5xl mx-auto">
        <nav
          aria-label="Main"
          className="relative flex items-center justify-between gap-3 rounded-pill border border-border/70 bg-surface/80 backdrop-blur-xl shadow-[var(--shadow-panel)] px-4 sm:px-5 py-2.5"
        >
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-3 min-h-[44px] rounded-pill shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
              GM
            </div>
            <span className="font-display font-semibold text-lg tracking-tight text-foreground">Gym Meals</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex items-center min-h-[40px] px-3.5 rounded-pill text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <LinkButton href="/login" variant="ghost" size="sm">
              Log In
            </LinkButton>
            <LinkButton href="/login" variant="primary" size="sm">
              Get Started
            </LinkButton>
          </div>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="lg:hidden w-11 h-11 flex items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </nav>

        {menuOpen && (
          <div
            id="landing-mobile-menu"
            ref={menuRef}
            role="menu"
            aria-label="Main"
            className="lg:hidden absolute right-2 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-panel shadow-[var(--shadow-modal)] p-2 z-50 animate-step-in"
          >
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center min-h-[44px] px-3 rounded-pill text-sm font-semibold text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {link.label}
              </a>
            ))}
            <div className="border-t border-border my-2" />
            <div className="flex flex-col gap-2 px-1 pb-1">
              <LinkButton href="/login" variant="secondary" onClick={() => setMenuOpen(false)}>
                Log In
              </LinkButton>
              <LinkButton href="/login" variant="primary" onClick={() => setMenuOpen(false)}>
                Get Started
              </LinkButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
