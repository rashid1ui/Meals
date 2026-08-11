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
}

export interface Meal {
  id: string; // UUID
  diet_plan_id: string; // UUID references diet_plans
  name: string; // e.g. "Breakfast", "Lunch"
  order_index: number;
  created_at?: string;
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
