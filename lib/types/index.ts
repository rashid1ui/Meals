export type FoodCategory = 'protein' | 'carbohydrate' | 'fat' | 'fruit' | 'vegetable' | 'dairy' | 'other';

export type PreparationState = 'raw' | 'cooked' | 'dry' | 'prepared' | 'ready_to_eat';

export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface UserProfile {
  id: string; // UUID from Supabase Auth
  full_name?: string | null;
  email: string;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
  // Nutrition Engine biometrics (lib/nutrition/engine.ts) - all optional,
  // collected via the onboarding "About You" step. NULL means "not yet
  // collected", not a default value - see supabase/migrations/0004.
  sex?: 'male' | 'female' | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity_level?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active' | null;
  training_days_per_week?: number | null;
  body_fat_percent?: number | null;
  average_daily_steps?: number | null;
  current_calorie_intake?: number | null;
  // Training Nutrition Setup (lib/nutrition/workoutMeals.ts's TrainingTime) -
  // collected via the onboarding "Training Nutrition Setup" step. NULL means
  // "not yet collected" - see supabase/migrations/0007_training_nutrition.
  training_time?: 'morning' | 'afternoon' | 'evening' | 'custom' | null;
  training_time_custom?: string | null; // "HH:MM", only set when training_time = 'custom'
  uses_supplements?: boolean;
  supplement_type?: 'whey' | 'creatine' | 'other' | null;
  protein_brand?: string | null;
  protein_serving_label?: string | null; // free text, e.g. "1 scoop"
  protein_per_serving_g?: number | null;
}

export interface Food {
  id: string; // UUID
  name: string;
  category: FoodCategory;
  serving_unit: string;
  serving_size: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_active: boolean;
  created_at?: string;
  // Protein-source classification (lib/nutrition/proteinType.ts) - NULL for
  // rows added before supabase/migrations/0007_training_nutrition, or any
  // custom food a user adds without one; lib/nutrition/proteinType.ts's
  // classifyProteinType() fallback covers those at read-time, so every food
  // is always attributed to exactly one bucket in the dashboard breakdown.
  protein_type?: 'animal' | 'plant' | 'supplement' | null;
}

export interface DietPlan {
  id: string; // UUID
  user_id: string; // UUID references profiles
  name: string;
  calories_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  created_at?: string;
  // Nutrition Engine provenance (lib/nutrition/engine.ts's NutritionTarget) -
  // all optional. NULL means this plan predates the engine or was entered
  // fully manually - see supabase/migrations/0005.
  goal?: 'cut' | 'recomp' | 'lean_bulk' | 'maintain' | null;
  estimated_maintenance_calories?: number | null;
  calorie_adjustment_percent?: number | null;
  protein_g_per_kg?: number | null;
  fat_g_per_kg?: number | null;
  target_weekly_rate_percent?: number | null;
  calculation_version?: string | null;
  targets_source?: 'recommended' | 'custom' | null;
}

export interface Meal {
  id: string; // UUID
  diet_plan_id: string; // UUID references diet_plans
  name: string; // e.g. "Breakfast", "Lunch"
  order_index: number;
  created_at?: string;
  // First-class reminder scheduling (see supabase/migrations/0006 and
  // lib/notifications/*). NULL reminder_time means "no reminder configured"
  // - distinct from reminder_enabled=false, which means "configured but
  // paused". Never derived from `name` - meal names are free text a user may
  // suffix with a time (see AddMealModal), which is not reliably parseable.
  reminder_time?: string | null; // "HH:MM", local wall-clock time
  reminder_enabled?: boolean;
}

// One row per user (supabase/migrations/0006). The single master switch that
// gates ALL notifications (reminders_enabled); milestones_enabled is a
// secondary sub-toggle for users who want meal reminders but not progress
// pings, or vice versa. `timezone` is captured client-side (Intl API) during
// onboarding and is Phase 1 metadata only - Phase 1 delivery always uses the
// browser's own local clock (see lib/notifications/schedule.ts); it exists
// now so a future server-side Web Push dispatcher (which has no browser
// clock) can compute each user's local time without a schema change.
export interface NotificationPreferences {
  user_id: string;
  reminders_enabled: boolean;
  milestones_enabled: boolean;
  timezone?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DietFood {
  id: string; // UUID
  meal_id: string; // UUID references meals
  food_id: string; // UUID references food_database
  quantity: number;
  unit: string;
  preparation_state?: PreparationState | null;
  notes?: string | null;
  created_at?: string;
}

export interface DailyTracking {
  id: string; // UUID
  user_id: string; // UUID references profiles
  date: string; // YYYY-MM-DD
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  created_at?: string;
}

export interface FoodTracking {
  id: string; // UUID
  daily_tracking_id: string; // UUID references daily_tracking
  food_id?: string | null; // UUID references food_database (optional if custom)
  meal_name?: string | null;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at?: string;
}
