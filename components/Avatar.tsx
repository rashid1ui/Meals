'use client'

import { useState } from 'react'
import Image from 'next/image'

type Props = {
  src?: string | null
  alt: string
  fallbackText: string
  size?: number
}

// Renders the user's avatar via next/image (requires next.config.ts's
// images.remotePatterns to allow the host, or it throws at load time), with
// a graceful fallback to the initials badge - both when no URL is provided
// and when the image fails to load (e.g. an unexpected/unconfigured host).
export default function Avatar({ src, alt, fallbackText, size = 40 }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-surface-elevated border-2 border-border text-foreground flex items-center justify-center"
      >
        {fallbackText}
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="rounded-full border-2 border-primary/30 object-cover"
    />
  )
}
