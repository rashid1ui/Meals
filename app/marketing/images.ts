// Food photography for the public surfaces (marketing landing page +
// /login) - all sourced live from Unsplash (images.unsplash.com), verified
// individually as free-to-use (not Unsplash+) before picking. Unsplash
// License: free for commercial and noncommercial use, no permission or
// attribution required - credited here anyway, for the record. None of this
// is copied from mealtrack.com or any competitor.
export type LandingImage = {
  src: string
  alt: string
  credit: string
  sourceUrl: string
}

function unsplash(id: string, width: number): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`
}

export const HERO_IMAGE: LandingImage = {
  src: unsplash('photo-1512621776951-a57141f2eefd', 2000),
  alt:
    'An overhead bowl of avocado, chickpeas, roasted sweet potato, cherry tomatoes, greens, and radish on a rustic wood table',
  credit: 'Anh Nguyen on Unsplash',
  sourceUrl: 'https://unsplash.com/@pwign'
}

// Login / auth surface - same "healthy bowl" visual family as the hero but
// a cleaner, centred composition on a seamless neutral background, so it
// reads as a calm editorial panel next to the sign-in card rather than
// competing with it.
export const LOGIN_IMAGE: LandingImage = {
  src: unsplash('photo-1546069901-ba9599a7e63c', 1400),
  alt:
    'An overhead protein bowl with grilled chicken, edamame, sweetcorn, egg, tomato, cucumber, and leafy greens on a light background',
  credit: 'Anh Nguyen on Unsplash',
  sourceUrl: 'https://unsplash.com/@pwign'
}

export const MEAL_PLANNER_IMAGE: LandingImage = {
  src: unsplash('photo-1666819691716-827f78d892f3', 900),
  alt: 'Meal prep containers with rice, sweet potato, kale, cherry tomatoes, and white beans',
  credit: 'Leanna Myers on Unsplash',
  sourceUrl: 'https://unsplash.com/photos/PRPJcBFP9rk'
}

export const FOOD_LIBRARY_IMAGE: LandingImage = {
  src: unsplash('photo-1647275621314-65bce39e218b', 900),
  alt: 'Oats with blueberries, whole eggs, and a glass of milk - staple whole foods',
  credit: 'Irene Fernandez on Unsplash',
  sourceUrl: 'https://unsplash.com/photos/lsBUgcLgr0o'
}

export const WORKOUT_NUTRITION_IMAGE: LandingImage = {
  src: unsplash('photo-1741330892093-19fd5bbe209a', 900),
  alt: 'A banana smoothie next to fresh bananas, viewed from above',
  credit: 'Balooon69 on Unsplash',
  sourceUrl: 'https://unsplash.com/photos/a2sz7pBAM4I'
}

export const SUPPLEMENTS_IMAGE: LandingImage = {
  src: unsplash('photo-1693996046865-19217d179161', 900),
  alt: 'A scoop of protein powder',
  credit: 'Alex Saks on Unsplash',
  sourceUrl: 'https://unsplash.com/photos/MUlIfSNODXE'
}
