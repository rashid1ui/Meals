'use client'

import { useState } from 'react'

type Props = {
  label: string
  value: string
  mono?: boolean
}

export default function CopyChip({ label, value, mono = false }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable (permissions, insecure context) - no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 min-h-[28px] px-2 rounded-md border border-border bg-surface text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        mono ? 'font-mono tabular-nums' : ''
      }`}
      aria-label={`Copy ${label}: ${value}`}
    >
      {copied ? 'Copied' : value}
    </button>
  )
}
