'use client'

import { classifyTarget, type MacroTotals, type TargetStatus } from '@/lib/diet/diff'
import type { Targets } from './DietEditor'

const STATUS_LABELS: Record<TargetStatus, string> = {
  'on-target': 'On Target',
  'slightly-over': 'Slightly Over',
  'slightly-under': 'Slightly Under',
  'over': 'Over Target',
  'under': 'Below Target'
}

const STATUS_STYLES: Record<TargetStatus, string> = {
  'on-target': 'bg-green-500/15 text-green-400 border-green-500/30',
  'slightly-over': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'slightly-under': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'over': 'bg-red-500/15 text-red-400 border-red-500/30',
  'under': 'bg-red-500/15 text-red-400 border-red-500/30'
}

function formatDiff(diff: number, unit: string): string {
  const rounded = Math.round(diff)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}${unit}`
}

type CardProps = {
  label: string
  value: number
  target: number
  unit: string
  valueColor: string
}

function Card({ label, value, target, unit, valueColor }: CardProps) {
  const { diff } = classifyTarget(value, target)
  return (
    <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
      <div className="text-gray-400 text-sm font-semibold mb-1">{label}</div>
      <div className={`text-3xl font-black ${valueColor}`}>{Math.round(value)}{unit}</div>
      <div className="text-xs text-gray-500 mt-1">Target: {target}{unit}</div>
      <div className="text-xs text-gray-400 mt-1">{formatDiff(diff, unit)}</div>
    </div>
  )
}

type Props = {
  totals: MacroTotals
  targets: Targets
}

export default function MacroSummaryCards({ totals, targets }: Props) {
  const overall = classifyTarget(totals.calories, targets.calories)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_STYLES[overall.status]}`}>
          Daily Status: {STATUS_LABELS[overall.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Calories" value={totals.calories} target={targets.calories} unit="" valueColor="text-white" />
        <Card label="Protein" value={totals.protein} target={targets.protein} unit="g" valueColor="text-blue-400" />
        <Card label="Carbs" value={totals.carbs} target={targets.carbs} unit="g" valueColor="text-orange-400" />
        <Card label="Fat" value={totals.fat} target={targets.fat} unit="g" valueColor="text-yellow-400" />
      </div>
    </div>
  )
}
