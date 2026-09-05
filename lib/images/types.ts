// Shared types for the automatic image-resolution system (lib/images/*).
// Pure - no Supabase, no network, no React. Safe to import anywhere.

// Provider attribution stored verbatim in the *.image_attribution jsonb
// column. Superset of the Pexels-only shape migration 0029 introduced, so an
// existing food row keeps validating unchanged.
export type ImageAttribution = {
  // Lowercase provider id: 'pexels' | 'openfoodfacts'.
  source: string
  // Pexels only.
  photographer?: string | null
  photographer_url?: string | null
  // Canonical page for the photo / product on the provider's site.
  source_url?: string | null
  // Open Food Facts photos are CC-BY-SA; recorded so the UI can honour it.
  license?: string | null
  // true when this is a category / stock stand-in, NOT the exact item -
  // e.g. a generic "vitamin D3 softgel" photo for a branded product we
  // could not find. The UI labels these "representative image".
  is_representative?: boolean
}

// Mirrors the migration 0030 image_status column.
export type ImageStatus =
  | 'pending'
  | 'resolved'
  | 'representative'
  | 'unresolved'
  | 'user_provided'

// What a resolver hands back for a single entity. `null` from a resolver
// means "no confident match" - the caller persists status='unresolved' and
// leaves image_url NULL so the emoji/pill fallback stays.
export type ResolvedImage = {
  url: string
  alt: string
  attribution: ImageAttribution
  // 'resolved'       - a confident, specific match.
  // 'representative' - a deliberately generic stand-in (also sets
  //                    attribution.is_representative).
  status: Extract<ImageStatus, 'resolved' | 'representative'>
}

// Candidate confidence tier from score.ts. HIGH and MEDIUM are stored; LOW
// is rejected (never a wrong image just to reach full coverage).
export type ImageConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

// A provider-agnostic photo candidate. Both the Pexels and Open Food Facts
// clients normalise their results into this shape before scoring.
export type ImageCandidate = {
  // Final, ready-to-store image URL (already sized/normalised).
  url: string
  // Human alt text / product name, may be empty.
  alt: string
  // Extra text the scorer may inspect (slug, category tags, brand) - never
  // shown to a user.
  haystack: string
  attribution: ImageAttribution
}

export type ImageEntityKind = 'food' | 'supplement' | 'meal'
