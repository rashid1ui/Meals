'use client'

// Shared app header/nav (Phase 1 foundation, mobile menu added Phase 6,
// floating pill redesign added Phase 2 reskin). The ONE navigation
// component for every authenticated page - Dashboard, Settings, and the
// Previous-Plan detail page all render this directly rather than their
// own inline nav markup.
//
// Layout uses an explicit 3-column grid (1fr / auto / 1fr) rather than
// flex justify-between, so Home + Insights sit in the true geometric
// center of the bar regardless of how wide the logo or the account
// controls are - a flex/justify-between split can't do that once the two
// sides are unequal width. Column-start is explicit on every zone so
// mobile (where the center zone is display:none) doesn't have auto grid
// placement collapse the right zone into the empty middle column.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { SignOutButton } from '@/components/SignOutButton'
import { MenuIcon, CloseIcon, ChartIcon, HomeIcon, AppleIcon } from '@/components/ui/icons'
import ThemeToggle from '@/components/ui/ThemeToggle'

type Props = {
  userName: string
  userEmail: string
  avatarUrl?: string | null
  avatarFallback?: string
  showSettingsLink?: boolean
}

export default function Header({
  userName,
  userEmail,
  avatarUrl,
  avatarFallback,
  showSettingsLink = true
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const fallback = avatarFallback || userName.charAt(0) || 'U'
  const pathname = usePathname()
  const isHomeActive = pathname === '/dashboard'
  const isInsightsActive = pathname?.startsWith('/dashboard/insights') ?? false
  const isScanActive = pathname?.startsWith('/dashboard/scan') ?? false

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

  const navLinkClasses = (active: boolean) =>
    `inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-pill text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
      active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
    }`

  return (
    <div className="sticky top-0 z-40 px-3 sm:px-4 pt-3">
      <nav className="relative max-w-6xl mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-pill border border-border bg-surface/95 backdrop-blur-xl px-3 sm:px-4 py-2">
        <Link
          href="/dashboard"
          className="col-start-1 flex items-center gap-2 sm:gap-3 min-h-[44px] rounded-pill shrink-0 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
            GM
          </div>
          <span className="hidden sm:inline font-display font-semibold text-lg tracking-tight text-foreground">
            Gym Meals
          </span>
        </Link>

        {/* Center: Home + Insights, true geometric center via the 1fr/auto/1fr grid above */}
        <div className="hidden sm:flex col-start-2 items-center justify-center gap-1">
          <Link href="/dashboard" aria-current={isHomeActive ? 'page' : undefined} className={navLinkClasses(isHomeActive)}>
            <HomeIcon size={17} />
            Home
          </Link>
          <Link
            href="/dashboard/insights"
            aria-current={isInsightsActive ? 'page' : undefined}
            className={navLinkClasses(isInsightsActive)}
          >
            <ChartIcon size={17} />
            Insights
          </Link>
          <Link
            href="/dashboard/scan"
            aria-current={isScanActive ? 'page' : undefined}
            className={navLinkClasses(isScanActive)}
          >
            <AppleIcon size={17} />
            Outside Plan
          </Link>
        </div>

        {/* Desktop: full identity + inline actions, 640px and up */}
        <div className="hidden sm:flex col-start-3 justify-self-end items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">{userName}</div>
            <div className="text-xs text-muted-foreground">{userEmail}</div>
          </div>
          <Avatar src={avatarUrl} alt="Avatar" fallbackText={fallback} />
          {showSettingsLink && (
            <Link
              href="/settings"
              className="min-h-[44px] flex items-center px-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Settings
            </Link>
          )}
          <ThemeToggle />
          <div className="ml-2 pl-4 border-l border-border">
            <SignOutButton />
          </div>
        </div>

        {/* Mobile: avatar + menu trigger only, below 640px */}
        <div className="flex sm:hidden col-start-3 justify-self-end items-center gap-2">
          <Avatar src={avatarUrl} alt="Avatar" fallbackText={fallback} size={36} />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="w-11 h-11 flex items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>

        {menuOpen && (
          <div
            id="mobile-nav-menu"
            ref={menuRef}
            role="menu"
            aria-label="Account menu"
            className="sm:hidden absolute right-2 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-elevated border border-border rounded-panel shadow-[var(--shadow-modal)] p-2 z-50 animate-step-in"
          >
            <div className="flex items-center gap-3 p-3 border-b border-border mb-2">
              <Avatar src={avatarUrl} alt="Avatar" fallbackText={fallback} size={36} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{userName}</div>
                <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
              </div>
            </div>
            <Link
              href="/dashboard"
              role="menuitem"
              aria-current={isHomeActive ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 min-h-[44px] px-3 rounded-pill text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isHomeActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-surface'
              }`}
            >
              <HomeIcon size={16} />
              Home
            </Link>
            <Link
              href="/dashboard/insights"
              role="menuitem"
              aria-current={isInsightsActive ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 min-h-[44px] px-3 rounded-pill text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isInsightsActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-surface'
              }`}
            >
              <ChartIcon size={16} />
              Insights
            </Link>
            <Link
              href="/dashboard/scan"
              role="menuitem"
              aria-current={isScanActive ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 min-h-[44px] px-3 rounded-pill text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isScanActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-surface'
              }`}
            >
              <AppleIcon size={16} />
              Outside Plan
            </Link>
            {showSettingsLink && (
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center min-h-[44px] px-3 rounded-pill text-sm font-semibold text-foreground hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Settings
              </Link>
            )}
            <ThemeToggle variant="menu-item" />
            <div className="px-3 pt-1 pb-1">
              <SignOutButton />
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}
