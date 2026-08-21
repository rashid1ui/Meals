// Shared app header/nav, built to the Phase 1 foundation spec. Not yet wired
// into Dashboard/Settings/Previous-Plan pages - those pages are out of scope
// for this phase and keep their existing inline nav markup untouched until
// their own redesign phase. This component matches their current content
// (logo, name/email, avatar, optional Settings link, sign out) so it can be
// dropped in as a like-for-like replacement later.
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { SignOutButton } from '@/components/SignOutButton'

type Props = {
  userName: string
  userEmail: string
  avatarUrl?: string | null
  showSettingsLink?: boolean
}

export default function Header({ userName, userEmail, avatarUrl, showSettingsLink = true }: Props) {
  return (
    <nav className="w-full bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
          GM
        </div>
        <span className="font-display font-bold text-xl tracking-tight text-foreground">Gym Meals</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-semibold text-foreground">{userName}</div>
          <div className="text-xs text-muted-foreground">{userEmail}</div>
        </div>
        <Avatar src={avatarUrl} alt="Avatar" fallbackText={userName.charAt(0) || 'U'} />
        {showSettingsLink && (
          <Link
            href="/settings"
            className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Settings
          </Link>
        )}
        <div className="ml-2 pl-4 border-l border-border">
          <SignOutButton />
        </div>
      </div>
    </nav>
  )
}
