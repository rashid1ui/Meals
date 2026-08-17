'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { regenerateDietPlan } from './actions'

export default function GenerateNewPlanButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openModal = () => {
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    if (loading) return // prevent dismissing mid-generation
    setShowModal(false)
    setError(null)
  }

  const handleGenerate = async () => {
    if (loading) return // prevent duplicate submissions from rapid repeated clicks
    setLoading(true)
    setError(null)

    try {
      const result = await regenerateDietPlan()

      if ('error' in result) {
        setError(result.error)
        setLoading(false)
        return
      }

      // Success - old plan has already been replaced server-side. Close the
      // modal and refresh so the dashboard immediately reflects the new plan.
      setShowModal(false)
      setLoading(false)
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
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
            <h3 className="text-2xl font-extrabold mb-3">Generate a new meal plan?</h3>
            <p className="text-gray-400 mb-6">
              Your current meal plan will be replaced if the new plan is generated successfully.
            </p>

            {error && (
              <div className="w-full p-4 mb-6 text-sm text-red-200 bg-red-900/40 border border-red-500/30 rounded-xl">
                {error}
              </div>
            )}

            {loading && (
              <div className="w-full p-4 mb-6 text-sm text-indigo-200 bg-indigo-900/30 border border-indigo-500/30 rounded-xl flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin flex-shrink-0" />
                Generating your new meal plan...
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={closeModal}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-[#0B0E14] border border-gray-700 hover:bg-gray-800 rounded-xl font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-all"
              >
                {loading ? 'Generating...' : 'Generate New Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
