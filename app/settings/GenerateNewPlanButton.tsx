'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// This button's ONLY job is to route the user into a fresh onboarding flow.
// It never calls DeepSeek and never generates or persists anything itself -
// app/onboarding/actions.ts's existing submitOnboarding is the sole
// generation entry point, reused as-is.
export default function GenerateNewPlanButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)

  const openModal = () => setShowModal(true)
  const closeModal = () => setShowModal(false)

  const startNewPlan = () => {
    router.push('/onboarding?newPlan=true')
  }

  return (
    <>
      <button
        onClick={openModal}
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all"
      >
        Generate New Meal Plan
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={closeModal}
          />
          <div className="w-full max-w-md bg-[#161B22] border border-gray-800 rounded-3xl p-8 shadow-2xl relative z-10 text-white">
            <h3 className="text-2xl font-extrabold mb-3">Start a new meal plan?</h3>
            <p className="text-gray-400 mb-6">
              You&apos;ll go through onboarding again to set new nutrition targets and food
              preferences. Your current plan stays active until you finish and generate a
              new one.
            </p>

            <div className="flex gap-4">
              <button
                onClick={closeModal}
                className="flex-1 px-6 py-3 bg-[#0B0E14] border border-gray-700 hover:bg-gray-800 rounded-xl font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={startNewPlan}
                className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all"
              >
                Start New Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
