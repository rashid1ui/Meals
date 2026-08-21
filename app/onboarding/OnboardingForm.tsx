'use client'

import { useState } from 'react'
import { submitOnboarding } from './actions'

type Food = {
  id: string
  name: string
  category: string
}

type Props = {
  foods: Food[]
  isNewPlanFlow?: boolean
}

export default function OnboardingForm({ foods, isNewPlanFlow = false }: Props) {
  const PROTEINS = foods.filter(f => ['protein', 'dairy'].includes((f.category || '').toLowerCase().trim()))
  const CARBS = foods.filter(f => ['carbohydrate', 'fruit'].includes((f.category || '').toLowerCase().trim()))
  const FATS = foods.filter(f => ['fat'].includes((f.category || '').toLowerCase().trim()))

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form State
  const [calories, setCalories] = useState('2250')
  const [protein, setProtein] = useState('150')
  const [carbs, setCarbs] = useState('250')
  const [fat, setFat] = useState('70')
  const [meals, setMeals] = useState('4')
  
  const [selectedProteins, setSelectedProteins] = useState<string[]>([])
  const [selectedCarbs, setSelectedCarbs] = useState<string[]>([])
  const [selectedFats, setSelectedFats] = useState<string[]>([])

  const toggleSelection = (id: string, current: string[], setter: (val: string[]) => void) => {
    if (current.includes(id)) {
      setter(current.filter(item => item !== id))
    } else {
      setter([...current, id])
    }
  }

  const handleNext = () => {
    setError(null)
    if (step === 1) {
      if (!calories || !protein || !carbs || !fat) {
        setError('Please fill in all macro targets.')
        return
      }
    } else if (step === 2) {
      if (selectedProteins.length === 0) {
        setError('Please select at least one protein source.')
        return
      }
    } else if (step === 3) {
      if (selectedCarbs.length === 0) {
        setError('Please select at least one carbohydrate source.')
        return
      }
    }
    setStep(prev => prev + 1)
  }

  const handleSubmit = async () => {
    setError(null)
    if (selectedFats.length === 0) {
      setError('Please select at least one fat source.')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('calories', calories)
      formData.append('protein', protein)
      formData.append('carbsTarget', carbs)
      formData.append('fat', fat)
      formData.append('meals', meals)
      formData.append('proteins', JSON.stringify(selectedProteins))
      formData.append('carbFoodIds', JSON.stringify(selectedCarbs))
      formData.append('fats', JSON.stringify(selectedFats))
      formData.append('newPlan', isNewPlanFlow ? 'true' : 'false')

      const result = await submitOnboarding(formData)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      }
      // If successful, the server action redirects to /dashboard
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'Failed to generate meal plan.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-[#161B22] border border-gray-800 rounded-3xl p-8 shadow-2xl relative z-10 text-white font-['Outfit',sans-serif]">
      {/* Progress */}
      <div className="flex justify-between items-center mb-8">
        <div className="text-sm font-semibold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full">
          Step {step} of 4
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`w-3 h-3 rounded-full ${i <= step ? 'bg-indigo-500' : 'bg-gray-700'}`} />
          ))}
        </div>
      </div>

      {error && (
        <div className="w-full p-4 mb-6 text-sm text-red-200 bg-red-900/40 border border-red-500/30 rounded-xl">
          {error}
        </div>
      )}

      {/* Step 1: Macros */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h2 className="text-3xl font-extrabold mb-2">Let&apos;s build your diet</h2>
            <p className="text-gray-400">First, enter your daily targets.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Daily Calories</label>
              <input type="number" value={calories} onChange={e => setCalories(e.target.value)} className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Protein (g)</label>
              <input type="number" value={protein} onChange={e => setProtein(e.target.value)} className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Carbohydrates (g)</label>
              <input type="number" value={carbs} onChange={e => setCarbs(e.target.value)} className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Fat (g)</label>
              <input type="number" value={fat} onChange={e => setFat(e.target.value)} className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <label className="text-sm text-gray-300 font-semibold">Meals Per Day</label>
            <select value={meals} onChange={e => setMeals(e.target.value)} className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none cursor-pointer">
              <option value="3">3 Meals</option>
              <option value="4">4 Meals</option>
              <option value="5">5 Meals</option>
              <option value="6">6 Meals</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 2: Proteins */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h2 className="text-3xl font-extrabold mb-2">Select Your Proteins</h2>
            <p className="text-gray-400">Choose the protein sources you prefer.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {PROTEINS.length > 0 ? (
              PROTEINS.map(item => (
                <button key={item.id} onClick={() => toggleSelection(item.id, selectedProteins, setSelectedProteins)} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${selectedProteins.includes(item.id) ? 'bg-indigo-500/10 border-indigo-500' : 'bg-[#0B0E14] border-gray-700 hover:border-gray-500'}`}>
                  <span className="font-semibold">{item.name}</span>
                  {selectedProteins.includes(item.id) && <div className="w-4 h-4 rounded-full bg-indigo-500" />}
                </button>
              ))
            ) : (
              <div className="col-span-2 p-4 border border-red-500/30 bg-red-900/20 rounded-xl text-red-200 text-sm">
                No protein sources available. Please contact support.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Carbs */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h2 className="text-3xl font-extrabold mb-2">Select Your Carbs</h2>
            <p className="text-gray-400">Choose the carbohydrate sources you prefer.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {CARBS.length > 0 ? (
              CARBS.map(item => (
                <button key={item.id} onClick={() => toggleSelection(item.id, selectedCarbs, setSelectedCarbs)} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${selectedCarbs.includes(item.id) ? 'bg-indigo-500/10 border-indigo-500' : 'bg-[#0B0E14] border-gray-700 hover:border-gray-500'}`}>
                  <span className="font-semibold">{item.name}</span>
                  {selectedCarbs.includes(item.id) && <div className="w-4 h-4 rounded-full bg-indigo-500" />}
                </button>
              ))
            ) : (
              <div className="col-span-2 p-4 border border-red-500/30 bg-red-900/20 rounded-xl text-red-200 text-sm">
                No carbohydrate sources available. Please contact support.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Fats */}
      {step === 4 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h2 className="text-3xl font-extrabold mb-2">Select Your Fats</h2>
            <p className="text-gray-400">Choose the fat sources you prefer.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {FATS.length > 0 ? (
              FATS.map(item => (
                <button key={item.id} onClick={() => toggleSelection(item.id, selectedFats, setSelectedFats)} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${selectedFats.includes(item.id) ? 'bg-indigo-500/10 border-indigo-500' : 'bg-[#0B0E14] border-gray-700 hover:border-gray-500'}`}>
                  <span className="font-semibold">{item.name}</span>
                  {selectedFats.includes(item.id) && <div className="w-4 h-4 rounded-full bg-indigo-500" />}
                </button>
              ))
            ) : (
              <div className="col-span-2 p-4 border border-red-500/30 bg-red-900/20 rounded-xl text-red-200 text-sm">
                No fat sources available. Please contact support.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 mt-8 pt-6 border-t border-gray-800">
        {step > 1 && (
          <button onClick={() => setStep(prev => prev - 1)} disabled={loading} className="px-6 py-3 bg-[#0B0E14] border border-gray-700 hover:bg-gray-800 rounded-xl font-semibold transition-all">
            Back
          </button>
        )}
        
        {step < 4 ? (
          <button onClick={handleNext} className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all">
            Continue
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-all">
            {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
            {loading ? 'Generating Diet...' : 'Generate Meal Plan'}
          </button>
        )}
      </div>
    </div>
  )
}
