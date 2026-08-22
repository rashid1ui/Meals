'use client'

// Shared app header/nav (Phase 1 foundation, mobile menu added Phase 6).
// The ONE navigation component for every authenticated page - Dashboard,
// Settings, and the Previous-Plan detail page all render this directly
// rather than their own inline nav markup.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { SignOutButton } from '@/components/SignOutButton'
import { MenuIcon, CloseIcon, ChartIcon } from '@/components/ui/icons'

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
  const isInsightsActive = pathname?.startsWith('/dashboard/insights') ?? false

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
    <nav className="relative w-full bg-surface border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 sm:gap-3 min-h-[44px] rounded-lg shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
            GM
          </div>
          <span className="font-display font-bold text-lg sm:text-xl tracking-tight text-foreground">
            Gym Meals
          </span>
        </Link>

        <Link
          href="/dashboard/insights"
          aria-label="Insights"
          aria-current={isInsightsActive ? 'page' : undefined}
          className={`hidden sm:flex items-center gap-1.5 min-h-[44px] px-2.5 md:px-3 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isInsightsActive
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
          }`}
        >
          <ChartIcon size={18} />
          <span className="hidden md:inline">Insights</span>
        </Link>
      </div>

      {/* Desktop: full identity + inline actions, 640px and up */}
      <div className="hidden sm:flex items-center gap-4">
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">{userName}</div>
          <div className="text-xs text-muted-foreground">{userEmail}</div>
        </div>
        <Avatar src={avatarUrl} alt="Avatar" fallbackText={fallback} />
        {showSettingsLink && (
          <Link
            href="/settings"
            className="min-h-[44px] flex items-center px-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Settings
          </Link>
        )}
        <div className="ml-2 pl-4 border-l border-border">
          <SignOutButton />
        </div>
      </div>

      {/* Mobile: avatar + menu trigger only, below 640px */}
      <div className="flex sm:hidden items-center gap-2">
        <Avatar src={avatarUrl} alt="Avatar" fallbackText={fallback} size={36} />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="w-11 h-11 flex items-center justify-center rounded-lg border border-border text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          className="sm:hidden absolute right-4 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-elevated border border-border rounded-xl shadow-2xl p-2 z-50 animate-step-in"
        >
          <div className="flex items-center gap-3 p-3 border-b border-border mb-2">
            <Avatar src={avatarUrl} alt="Avatar" fallbackText={fallback} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{userName}</div>
              <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
            </div>
          </div>
          <Link
            href="/dashboard/insights"
            role="menuitem"
            aria-current={isInsightsActive ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
            className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isInsightsActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-surface'
            }`}
          >
            <ChartIcon size={16} />
            Insights
          </Link>
          {showSettingsLink && (
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center min-h-[44px] px-3 rounded-lg text-sm font-semibold text-foreground hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Settings
            </Link>
          )}
          <div className="px-3 pt-1 pb-1">
            <SignOutButton />
          </div>
        </div>
      )}
    </nav>
  )
}
