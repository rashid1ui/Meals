'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { resetAccount } from './actions'
import { clearLocalOnboardingDraft } from '@/lib/onboarding/draftStorage'

export default function ResetAccountButton() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfirmed = confirmationText === 'RESET'

  const handleReset = async () => {
    if (!isConfirmed) return

    setLoading(true)
    setError(null)

    try {
      const res = await resetAccount()

      if (!res.ok) {
        setError(res.error || 'Failed to reset account.')
        setLoading(false)
        return
      }

      // Reset succeeded server-side (including the account-scoped
      // onboarding_drafts row). Also clear THIS device's local onboarding
      // draft - otherwise the next time the wizard mounts (this session or a
      // future login, same browser) it finds the stale pre-reset draft in
      // localStorage and resumes from it instead of starting fresh, and can
      // even resave it back to the server, undoing the reset. Both copies
      // must be cleared together; clearing only one lets the other
      // repopulate it.
      clearLocalOnboardingDraft()

      // Sign out the user locally.
      const supabase = createClient()
      await supabase.auth.signOut()
      
      router.push('/login')
      router.refresh()
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setIsOpen(false)
    setConfirmationText('')
    setError(null)
  }

  return (
    <>
      <Button variant="danger" onClick={() => setIsOpen(true)}>
        Reset My Account
      </Button>

      {isOpen && (
        <Modal labelledBy="reset-account-title" onClose={handleClose}>
          <div className="space-y-6">
            <div>
              <h2 id="reset-account-title" className="font-display text-xl font-bold text-foreground mb-2">
                Start over from scratch?
              </h2>
              <p className="text-sm text-muted-foreground">
                This will permanently delete your diet plans, meals, preferences, and other Gym Meals data. Your login account will remain.
              </p>
            </div>

            <Input
              label="Type RESET to confirm"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder="RESET"
              disabled={loading}
              autoComplete="off"
            />

            {error && (
              <div className="p-3 bg-error/10 text-error rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleReset} disabled={!isConfirmed || loading} loading={loading}>
                Yes, Reset Everything
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
