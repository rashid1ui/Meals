import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  elevated?: boolean
}

export default function Card({ elevated = false, className = '', children, ...rest }: Props) {
  return (
    <div
      className={`${elevated ? 'bg-surface-elevated' : 'bg-surface'} border border-border rounded-xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
