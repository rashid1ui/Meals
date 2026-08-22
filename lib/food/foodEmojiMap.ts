export const DEFAULT_FOOD_EMOJI = '🍽️'

// Keyed by the exact food_database `name` value. Custom foods a user adds
// via CreateFoodForm won't have an entry here - getFoodEmoji() falls back
// to DEFAULT_FOOD_EMOJI for those, and for any catalog food added later
// that hasn't been mapped yet.
export const FOOD_EMOJI_MAP: Record<string, string> = {
  'Chicken Breast, Raw': '🍗',
  'Lean Ground Beef 93/7, Raw': '🥩',
  'Turkey Breast, Raw': '🦃',
  'Atlantic Salmon, Raw': '🐟',
  'Whole Egg, Raw': '🥚',
  'Egg Whites, Raw': '🥚',
  'Tilapia, Raw': '🐟',
  'Tofu, Firm, Raw': '🌱',
  'Tuna, Light, Canned in Water': '🐟',
  'Bison, Ground, Raw': '🥩',
  'Mozzarella, Part Skim': '🧀',
  'Nonfat Greek Yogurt': '🥛',
  'Whole Milk': '🥛',
  '2% Milk': '🥛',
  'Cottage Cheese, Lowfat 2%': '🥣',
  'Cheddar Cheese': '🧀',
  'White Rice, Dry': '🍚',
  'Brown Rice, Dry': '🍚',
  'Rolled Oats, Dry': '🥣',
  'Sweet Potato, Raw': '🍠',
  'White Potato, Raw': '🥔',
  'Quinoa, Dry': '🌾',
  'Whole Wheat Pasta, Dry': '🍝',
  'Lentils, Dry': '🫘',
  'Black Beans, Dry': '🫘',
  'Chickpeas, Dry': '🫘',
  'Banana, Raw': '🍌',
  'Apple, Raw': '🍎',
  'Strawberries, Raw': '🍓',
  'Blueberries, Raw': '🫐',
  'Orange, Raw': '🍊',
  'Avocado, Raw': '🥑',
  'Almonds, Raw': '🌰',
  'Peanut Butter, Smooth': '🥜',
  'Olive Oil, Extra Virgin': '🫒',
  'Walnuts, Raw': '🌰',
  'Butter, Unsalted': '🧈'
}

export function getFoodEmoji(name: string): string {
  return FOOD_EMOJI_MAP[name] ?? DEFAULT_FOOD_EMOJI
}
