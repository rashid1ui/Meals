-- ==============================================================================
-- USDA FoodData Central Dataset Seed
-- ==============================================================================
-- Data Source: USDA FoodData Central (Foundation & SR Legacy)
-- Description: This file is a controlled food-data seed for the application.
-- 
-- IMPORTANT NOTES:
-- 1. All nutritional values are normalized per 100g.
-- 2. Preparation state is explicitly included in the food name/metadata (e.g., Raw, Dry).
-- 3. IDEMPOTENCY WARNING: If the 'food_database' schema lacks a UNIQUE constraint 
--    on the 'name' column, running this script multiple times WILL create duplicates.
--    Please execute this script ONLY ONCE unless resetting the database.
-- ==============================================================================

INSERT INTO food_database (name, category, serving_size, serving_unit, calories, protein, carbs, fat, is_active)
VALUES
  ('Chicken Breast, Raw', 'protein', 100, 'grams', 120, 22.5, 0, 2.6, true),
  ('Lean Ground Beef 93/7, Raw', 'protein', 100, 'grams', 150, 21.4, 0, 7, true),
  ('Turkey Breast, Raw', 'protein', 100, 'grams', 114, 23.7, 0, 1.5, true),
  ('Atlantic Salmon, Raw', 'protein', 100, 'grams', 142, 19.8, 0, 6.3, true),
  ('Whole Egg, Raw', 'protein', 100, 'grams', 143, 12.6, 0.7, 9.5, true),
  ('Egg Whites, Raw', 'protein', 100, 'grams', 52, 10.9, 0.7, 0.2, true),
  ('Tilapia, Raw', 'protein', 100, 'grams', 96, 20.1, 0, 1.7, true),
  ('Tofu, Firm, Raw', 'protein', 100, 'grams', 144, 15.8, 2.8, 8.7, true),
  ('Pork Tenderloin, Raw', 'protein', 100, 'grams', 120, 21.1, 0, 3.4, true),
  ('Tuna, Light, Canned in Water', 'protein', 100, 'grams', 90, 19.4, 0, 0.8, true),
  ('Bison, Ground, Raw', 'protein', 100, 'grams', 146, 20.2, 0, 7.3, true),
  ('Nonfat Greek Yogurt', 'dairy', 100, 'grams', 59, 10.2, 3.6, 0.4, true),
  ('Whole Milk', 'dairy', 100, 'grams', 61, 3.1, 4.8, 3.2, true),
  ('2% Milk', 'dairy', 100, 'grams', 50, 3.3, 4.8, 2, true),
  ('Cottage Cheese, Lowfat 2%', 'dairy', 100, 'grams', 81, 10.4, 4.3, 2.3, true),
  ('Cheddar Cheese', 'dairy', 100, 'grams', 403, 24.9, 1.3, 33.1, true),
  ('Mozzarella, Part Skim', 'protein', 100, 'grams', 254, 24.3, 2.8, 15.9, true),
  ('White Rice, Dry', 'carbohydrate', 100, 'grams', 365, 7.1, 80, 0.7, true),
  ('Brown Rice, Dry', 'carbohydrate', 100, 'grams', 367, 7.5, 76.2, 3.2, true),
  ('Rolled Oats, Dry', 'carbohydrate', 100, 'grams', 379, 13.2, 67.7, 6.5, true),
  ('Sweet Potato, Raw', 'carbohydrate', 100, 'grams', 86, 1.6, 20.1, 0.1, true),
  ('White Potato, Raw', 'carbohydrate', 100, 'grams', 77, 2, 17.5, 0.1, true),
  ('Quinoa, Dry', 'carbohydrate', 100, 'grams', 368, 14.1, 64.2, 6.1, true),
  ('Whole Wheat Pasta, Dry', 'carbohydrate', 100, 'grams', 348, 14.6, 75, 1.4, true),
  ('Lentils, Dry', 'carbohydrate', 100, 'grams', 353, 25.8, 60.1, 1.1, true),
  ('Black Beans, Dry', 'carbohydrate', 100, 'grams', 341, 21.6, 62.4, 1.4, true),
  ('Chickpeas, Dry', 'carbohydrate', 100, 'grams', 378, 20.5, 63, 6, true),
  ('Banana, Raw', 'fruit', 100, 'grams', 89, 1.1, 22.8, 0.3, true),
  ('Apple, Raw', 'fruit', 100, 'grams', 52, 0.3, 13.8, 0.2, true),
  ('Strawberries, Raw', 'fruit', 100, 'grams', 32, 0.7, 7.7, 0.3, true),
  ('Blueberries, Raw', 'fruit', 100, 'grams', 57, 0.7, 14.5, 0.3, true),
  ('Orange, Raw', 'fruit', 100, 'grams', 47, 0.9, 11.8, 0.1, true),
  ('Avocado, Raw', 'fat', 100, 'grams', 160, 2, 8.5, 14.7, true),
  ('Almonds, Raw', 'fat', 100, 'grams', 579, 21.2, 21.6, 49.9, true),
  ('Peanut Butter, Smooth', 'fat', 100, 'grams', 588, 25.1, 20, 50.4, true),
  ('Olive Oil, Extra Virgin', 'fat', 100, 'grams', 884, 0, 0, 100, true),
  ('Walnuts, Raw', 'fat', 100, 'grams', 654, 15.2, 13.7, 65.2, true),
  ('Butter, Unsalted', 'fat', 100, 'grams', 717, 0.9, 0.1, 81.1, true);

-- ==============================================================================
-- Verification Queries
-- ==============================================================================

-- 1. Total inserted food count
SELECT COUNT(*) AS total_foods FROM food_database;

-- 2. Count by category
SELECT category, COUNT(*) AS category_count 
FROM food_database 
GROUP BY category 
ORDER BY category;

-- 3. Count of active foods
SELECT COUNT(*) AS active_foods FROM food_database WHERE is_active = true;

-- 4. Duplicate canonical names (Should return 0 rows)
SELECT name, COUNT(*) 
FROM food_database 
GROUP BY name 
HAVING COUNT(*) > 1;

-- 5. Records with serving_size != 100 (Should return 0 rows)
SELECT id, name, serving_size FROM food_database WHERE serving_size != 100;

-- 6. Records with serving_unit != 'grams' (Should return 0 rows)
SELECT id, name, serving_unit FROM food_database WHERE serving_unit != 'grams';

-- 7. Records with NULL macronutrients (Should return 0 rows)
SELECT id, name 
FROM food_database 
WHERE calories IS NULL OR protein IS NULL OR carbs IS NULL OR fat IS NULL;

-- 8. Records with negative macro values (Should return 0 rows)
SELECT id, name, calories, protein, carbs, fat 
FROM food_database 
WHERE calories < 0 OR protein < 0 OR carbs < 0 OR fat < 0;
