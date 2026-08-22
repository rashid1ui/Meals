'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { AlertIcon, CheckIcon } from '@/components/ui/icons'

// Purely cosmetic status copy advancing on a client-side timer - it does not
// reflect real backend completion (the actual generation call in
// OnboardingForm/actions.ts has no progress-reporting API to read from).
// Stops advancing at the final stage rather than looping, since a real
// request can run right up to the ~60s server timeout.
const STAGES = [
  'Reviewing your targets',
  'Balancing your macros',
  'Selecting your foods',
  'Building your meals'
]

const STAGE_INTERVAL_MS = 13000

// How long the success state sits before auto-navigating - long enough to
// read the confirmation, short enough not to feel like a stall. The "View
// My Meal Plan" button lets an impatient user skip the wait entirely.
const SUCCESS_AUTO_CONTINUE_MS = 2200

type Props = {
  status: 'generating' | 'success' | 'error'
  errorMessage?: string | null
  onRetry: () => void
  onGoBack?: () => void
  onContinue?: () => void
}

export default function GeneratingPanel({ status, errorMessage, onRetry, onGoBack, onContinue }: Props) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (status !== 'generating') return
    const interval = setInterval(() => {
      setStageIndex(prev => (prev < STAGES.length - 1 ? prev + 1 : prev))
    }, STAGE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [status])

  useEffect(() => {
    if (status !== 'success' || !onContinue) return
    const timer = setTimeout(onContinue, SUCCESS_AUTO_CONTINUE_MS)
    return () => clearTimeout(timer)
  }, [status, onContinue])

  if (status === 'success') {
    return (
      <Card className="p-8 text-center space-y-5" role="status" aria-live="polite">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
          <CheckIcon size={22} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">🎉 Your Meal Plan Is Ready!</h1>
          <p className="text-muted-foreground mt-2">
            Your personalized meal plan has been created successfully.
          </p>
        </div>
        <Button onClick={onContinue} className="w-full">
          View My Meal Plan →
        </Button>
      </Card>
    )
  }

  if (status === 'error') {
    return (
      <Card className="p-8 text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-error/15 border border-error/30 flex items-center justify-center text-error">
          <AlertIcon size={22} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Generation Failed</h1>
          <p className="text-muted-foreground mt-2">
            {errorMessage || 'Something went wrong while building your meal plan.'}
          </p>
        </div>
        <div className="flex gap-3">
          {onGoBack && (
            <Button variant="secondary" onClick={onGoBack} className="flex-1">
              Go Back
            </Button>
          )}
          <Button onClick={onRetry} className="flex-1">
            Try Again
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-8 text-center space-y-6" role="status" aria-busy="true" aria-live="polite">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Building your meal plan</h1>
        <p key={stageIndex} className="text-muted-foreground mt-2 animate-step-in">
          {STAGES[stageIndex]}&hellip;
        </p>
      </div>

      <div className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-indeterminate-bar" />
      </div>

      <p className="text-xs text-muted-foreground">
        This usually takes under a minute. Please don&apos;t close this page.
      </p>
    </Card>
  )
}
