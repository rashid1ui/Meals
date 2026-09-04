'use client'

import { useState } from 'react'
import Image from 'next/image'
import { resolveFoodImage, type FoodImageFields } from '@/lib/food/foodImage'
import { getFoodEmoji } from '@/lib/food/foodEmojiMap'

type Props = {
  // The food_database row (or the subset carrying the image columns). null /
  // undefined - or a row with no stored image - renders the deterministic
  // emoji fallback, never a broken image.
  food: FoodImageFields | null | undefined
  // Used for the emoji fallback lookup and as a last-resort alt text.
  name: string
  // Tailwind size classes for the square (width + height). Defaults to a
  // responsive 40 -> 48 -> 56px so the row stays compact on a ~320px phone
  // and a little more generous on desktop.
  sizeClassName?: string
  className?: string
}

// A real food photo in a rounded square, with a deterministic fallback.
//
// It NEVER fetches an image API: `resolveFoodImage` only reads a URL that was
// already stored on the food row by scripts/assign-food-images.ts, so
// rendering a hundred rows costs zero API requests. The emoji tile is always
// rendered UNDERNEATH the photo, so a missing URL, a slow load, a 404, or a
// decode error can never leave an empty box - the photo simply fades in over
// the emoji when (and if) it is ready. The square is a fixed size, so the
// row height never shifts.
export default function FoodThumb({
  food,
  name,
  sizeClassName = 'w-10 h-10 min-[420px]:w-12 min-[420px]:h-12 sm:w-14 sm:h-14',
  className = ''
}: Props) {
  const resolved = resolveFoodImage(food, name)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const showImage = resolved !== null && !failed

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-chip border border-border bg-surface-elevated ${sizeClassName} ${className}`}
    >
      {/* Fallback layer - always present beneath the photo. Doubles as the
          loading state (a neutral tinted tile with the food's emoji) and the
          error state. */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center text-lg leading-none transition-opacity duration-300 ${
          showImage && loaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {getFoodEmoji(name)}
      </span>

      {showImage && (
        <Image
          src={resolved!.src}
          alt={resolved!.alt}
          fill
          sizes="56px"
          title={resolved!.credit ?? undefined}
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
