'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { resolveStoredImage, type FoodImageFields } from '@/lib/food/foodImage'

type Props = {
  // The row (or subset) carrying image_url / image_alt / image_attribution.
  // null / undefined - or a row with no stored image - renders `fallback`,
  // never a broken image.
  image: FoodImageFields | null | undefined
  // Shown while loading, on error, and when there is no stored image
  // (an emoji, a category icon, etc).
  fallback: ReactNode
  // Alt text when none was stored with the image.
  fallbackAlt: string
  // Tailwind size classes for the square (width + height).
  sizeClassName?: string
  className?: string
  // next/image `sizes` hint.
  sizes?: string
}

// A stored photo (meal / supplement / product) in a rounded square, with a
// deterministic fallback rendered UNDERNEATH so a missing URL, slow load,
// 404 or decode error can never leave an empty box or shift layout.
//
// NEVER fetches an image API: `resolveStoredImage` only reads a URL already
// stored on the row by the resolver (lib/images/*).
export default function StoredImageThumb({
  image,
  fallback,
  fallbackAlt,
  sizeClassName = 'w-10 h-10 sm:w-12 sm:h-12',
  className = '',
  sizes = '56px'
}: Props) {
  const resolved = resolveStoredImage(image, fallbackAlt)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const showImage = resolved !== null && !failed

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-chip border border-border bg-surface-elevated ${sizeClassName} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center text-lg leading-none transition-opacity duration-300 ${
          showImage && loaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {fallback}
      </span>

      {showImage && (
        <Image
          src={resolved.src}
          alt={resolved.alt}
          fill
          sizes={sizes}
          title={resolved.credit ?? undefined}
          className={`object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true)
            setLoaded(false)
          }}
        />
      )}
    </span>
  )
}
