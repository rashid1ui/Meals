'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { AlertIcon } from '@/components/ui/icons'

// This button's ONLY job is to route the user into a fresh onboarding flow.
// It never calls DeepSeek and never generates or persists anything itself -
// app/onboarding/actions.ts's existing submitOnboarding is the sole
// generation entry point, reused as-is. The actual "generating" experience
// (rotating status copy, progress bar, retry-on-error) already lives in
// app/onboarding/GeneratingPanel.tsx and is reused automatically once this
// button navigates there - it is not duplicated here.
export default function GenerateNewPlanButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [navigating, setNavigating] = useState(false)

  const openModal = () => setShowModal(true)
  const closeModal = () => setShowModal(false)

  const startNewPlan = () => {
    setNavigating(true)
    router.push('/onboarding?newPlan=true')
  }

  return (
    <>
      <Button variant="primary" onClick={openModal}>
        Generate New Meal Plan
      </Button>

      {showModal && (
        <Modal onClose={closeModal} labelledBy="generate-new-plan-title">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-warning/15 border border-warning/30 flex items-center justify-center text-warning shrink-0">
              <AlertIcon size={20} />
            </div>
            <h3 id="generate-new-plan-title" className="font-display text-2xl font-bold text-foreground pt-1">
              Start a new meal plan?
            </h3>
          </div>

          <ul className="text-muted-foreground mb-6 space-y-2 text-sm list-disc pl-5">
            <li>You&apos;ll go through onboarding again to set new nutrition targets and food preferences.</li>
            <li>Your current plan stays fully active while you do this.</li>
            <li>Your current plan only becomes historical after the new plan finishes generating successfully.</li>
          </ul>

          <div className="flex gap-4">
            <Button variant="secondary" onClick={closeModal} disabled={navigating} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={startNewPlan} loading={navigating} className="flex-1">
              {navigating ? 'Starting...' : 'Start New Plan'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
