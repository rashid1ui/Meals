'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { AlertIcon } from '@/components/ui/icons'

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

type Props = {
  status: 'generating' | 'error'
  errorMessage?: string | null
  onRetry: () => void
}

export default function GeneratingPanel({ status, errorMessage, onRetry }: Props) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (status !== 'generating') return
    const interval = setInterval(() => {
      setStageIndex(prev => (prev < STAGES.length - 1 ? prev + 1 : prev))
    }, STAGE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [status])

  if (status === 'error') {
    return (
      <Card className="p-8 text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-error/15 border border-error/30 flex items-center justify-center text-error">
          <AlertIcon size={22} />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Generation failed</h2>
          <p className="text-muted-foreground mt-2">
            {errorMessage || 'Something went wrong while building your meal plan.'}
          </p>
        </div>
        <Button onClick={onRetry} className="w-full">
          Try Again
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-8 text-center space-y-6" role="status" aria-busy="true" aria-live="polite">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Building your meal plan</h2>
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
